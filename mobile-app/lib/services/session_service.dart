import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/ticket_data.dart';

enum RelayStatus { disconnected, connecting, connected }

/// Handles pairing and data transfer to the desktop.
///
/// Two modes (auto-detected from QR):
///   1. Local/LAN   — HTTP POST to desktop's built-in API server (port 7423).
///                    Health-checked every 20 s via GET /api/v1/health.
///   2. Relay/Cloud — WebSocket to a Go relay server.
///                    QR includes session=XXX&relay=ws://HOST:PORT.
class SessionService {
  static final SessionService _instance = SessionService._();
  factory SessionService() => _instance;
  SessionService._();

  String? _desktopHost; // "192.168.x.x:7423" — local direct mode
  String? _relayUrl;    // "ws://relay:8080"   — relay mode
  String? _sessionId;

  WebSocket? _ws;
  RelayStatus _status = RelayStatus.disconnected;
  Timer? _pingTimer;
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;

  final _statusCtrl = StreamController<RelayStatus>.broadcast();
  Stream<RelayStatus> get statusStream => _statusCtrl.stream;
  RelayStatus get status     => _status;
  String? get sessionId      => _sessionId;
  String? get desktopHost    => _desktopHost;
  bool get connected         => _status == RelayStatus.connected;

  // ── Pairing from QR code ────────────────────────────────────────────────────
  // Supported QR formats:
  //   lottery://pair?host=192.168.1.5:7423         ← LAN direct (MobileServerCard)
  //   lottery://pair?session=XX&relay=ws://HOST     ← Go relay (MobileRelayCard)
  //   lottery://192.168.1.5:7423                   ← legacy
  Future<bool> joinFromQR(String qrData) async {
    final uri = Uri.tryParse(qrData);
    if (uri == null || uri.scheme != 'lottery') return false;

    final host    = uri.queryParameters['host'];
    final relay   = uri.queryParameters['relay'];
    final session = uri.queryParameters['session'];

    // Legacy format: lottery://IP:PORT  (no path, just host+port)
    final legacyHost = (host == null && relay == null && uri.host.isNotEmpty)
        ? '${uri.host}:${uri.port > 0 ? uri.port : 7423}'
        : null;

    final effectiveHost = host ?? legacyHost;
    if (effectiveHost == null && relay == null) return false;

    final prefs = await SharedPreferences.getInstance();

    if (effectiveHost != null) {
      _desktopHost = effectiveHost;
      _relayUrl    = null;
      _ws?.close();
      _ws = null;
      await prefs.setString('desktop_host', effectiveHost);
      await prefs.remove('relay_url');
    }

    if (relay != null) {
      _relayUrl    = relay;
      _desktopHost = null;
      await prefs.setString('relay_url', relay);
      await prefs.remove('desktop_host');
    }

    if (session != null) {
      _sessionId = session;
      await prefs.setString('session_id', session);
    }

    _startPingTimer();

    if (_relayUrl != null && _sessionId != null) {
      return _connectRelay();
    }
    return _pingDesktop();
  }

  // ── Restore saved connection on app launch ──────────────────────────────────
  Future<void> loadAndConnect() async {
    final prefs = await SharedPreferences.getInstance();
    _desktopHost = prefs.getString('desktop_host');
    _relayUrl    = prefs.getString('relay_url');
    _sessionId   = prefs.getString('session_id');

    if (_relayUrl != null && _sessionId != null) {
      await _connectRelay();
    } else if (_desktopHost != null) {
      await _pingDesktop();
    }
    _startPingTimer();
  }

  // ── Local HTTP health-check ─────────────────────────────────────────────────
  Future<bool> _pingDesktop() async {
    if (_desktopHost == null) return false;
    _setStatus(RelayStatus.connecting);
    try {
      final client = HttpClient()
        ..connectionTimeout = const Duration(seconds: 5)
        ..idleTimeout       = const Duration(seconds: 5);
      final req  = await client.getUrl(
          Uri.parse('http://$_desktopHost/api/v1/health'));
      final resp = await req.close().timeout(const Duration(seconds: 5));
      await resp.drain<void>();
      client.close(force: true);
      if (resp.statusCode == 200) {
        _reconnectAttempts = 0;
        _setStatus(RelayStatus.connected);
        return true;
      }
    } catch (_) {}
    _setStatus(RelayStatus.disconnected);
    return false;
  }

  // ── WebSocket relay connection ──────────────────────────────────────────────
  Future<bool> _connectRelay() async {
    if (_relayUrl == null || _sessionId == null) return false;
    _setStatus(RelayStatus.connecting);
    try {
      final base  = _relayUrl!.endsWith('/ws') ? _relayUrl! : '$_relayUrl/ws';
      final wsUrl = '$base?session=$_sessionId&role=mobile';
      _ws?.close();
      _ws = await WebSocket.connect(wsUrl)
          .timeout(const Duration(seconds: 8));
      _reconnectAttempts = 0;
      _setStatus(RelayStatus.connected);
      _ws!.listen(
        (_) {},
        onDone:  _onRelayDisconnected,
        onError: (_) => _onRelayDisconnected(),
        cancelOnError: true,
      );
      return true;
    } catch (_) {
      _setStatus(RelayStatus.disconnected);
      _scheduleReconnect();
      return false;
    }
  }

  void _onRelayDisconnected() {
    _ws = null;
    _setStatus(RelayStatus.disconnected);
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    final secs = _reconnectAttempts < 5 ? 5 * (_reconnectAttempts + 1) : 30;
    _reconnectTimer = Timer(Duration(seconds: secs), () {
      _reconnectAttempts++;
      if (_relayUrl != null) _connectRelay();
    });
  }

  // ── Periodic ping keeps status fresh in LAN mode ────────────────────────────
  void _startPingTimer() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (_desktopHost != null && _relayUrl == null) _pingDesktop();
    });
  }

  // ── Send scanned ticket to desktop ─────────────────────────────────────────
  Future<void> sendTicketData(TicketData ticket, String action) async {
    // Relay WebSocket path
    if (_ws != null && _status == RelayStatus.connected) {
      try {
        _ws!.add(jsonEncode({
          'type':    'ticket_scanned',
          'session': _sessionId,
          'action':  action,
          'ticket':  ticket.toJson(),
          'ts':      DateTime.now().toIso8601String(),
        }));
        return;
      } catch (_) {
        _onRelayDisconnected();
      }
    }

    // LAN HTTP POST path (direct to desktop API server)
    if (_desktopHost != null) {
      try {
        final client = HttpClient()
          ..connectionTimeout = const Duration(seconds: 6)
          ..idleTimeout       = const Duration(seconds: 6);
        final req = await client.postUrl(
            Uri.parse('http://$_desktopHost/api/v1/purchases'));
        req.headers
          ..set('Content-Type', 'application/json')
          ..set('x-api-key', 'LOTTERY_COMPANION');
        req.write(jsonEncode({
          'game_name':     ticket.gameName,
          'barcode_start': ticket.serialNumber,
          'barcode_end':   '',
          'qty':           0,
          'unit_price':    32.5,
          'purchase_date': ticket.drawDate,
          'draw_number':   ticket.drawNumber,
          'board':         ticket.board,
        }));
        final resp = await req.close().timeout(const Duration(seconds: 6));
        await resp.drain<void>();
        client.close(force: true);
        if (resp.statusCode >= 200 && resp.statusCode < 300) {
          _setStatus(RelayStatus.connected);
        }
      } catch (_) {
        _setStatus(RelayStatus.disconnected);
      }
    }
  }

  void _setStatus(RelayStatus s) {
    _status = s;
    _statusCtrl.add(s);
  }

  void disconnect() {
    _pingTimer?.cancel();
    _reconnectTimer?.cancel();
    _ws?.close();
    _ws = null;
    _desktopHost = null;
    _relayUrl    = null;
    _sessionId   = null;
    _setStatus(RelayStatus.disconnected);
  }

  void dispose() {
    disconnect();
    _statusCtrl.close();
  }
}
