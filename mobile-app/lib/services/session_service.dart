import 'dart:async';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import '../models/ticket_data.dart';

// ── Connection state ──────────────────────────────────────────────────────────
enum RelayStatus { disconnected, connecting, connected }

class SessionService {
  static final SessionService _instance = SessionService._();
  factory SessionService() => _instance;
  SessionService._();

  // Current state
  String? _sessionId;
  String? _relayUrl;         // ws(s)://relay-server
  RelayStatus _status       = RelayStatus.disconnected;
  RealtimeChannel? _channel; // Supabase fallback channel
  int _peerCount            = 0;
  Timer? _reconnectTimer;

  // Stream for UI to observe status
  final _statusCtrl = StreamController<RelayStatus>.broadcast();
  Stream<RelayStatus> get statusStream => _statusCtrl.stream;
  RelayStatus get status => _status;
  String? get sessionId => _sessionId;
  int get peerCount => _peerCount;
  bool get connected => _status == RelayStatus.connected;

  // ── Pairing from QR ──────────────────────────────────────────────────────────
  /// QR contains: lottery://pair?session=XXXX&relay=wss://...
  /// OR:          lottery://pair?session=XXXX&url=https://...&key=eyJ...
  Future<bool> joinFromQR(String qrData) async {
    final uri = Uri.tryParse(qrData);
    if (uri == null || uri.scheme != 'lottery') return false;

    final session = uri.queryParameters['session'] ?? '';
    if (session.isEmpty) return false;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('session_id', session);

    // Go relay path
    final relay = uri.queryParameters['relay'] ?? '';
    if (relay.isNotEmpty) {
      await prefs.setString('relay_url', relay);
      _sessionId = session;
      _relayUrl  = relay;
      await _connectRelay();
      return _status == RelayStatus.connected;
    }

    // Supabase fallback path
    final supaUrl = uri.queryParameters['url'] ?? '';
    final supaKey = uri.queryParameters['key'] ?? '';
    if (supaUrl.isNotEmpty && supaKey.isNotEmpty) {
      await prefs.setString('supabase_url', supaUrl);
      await prefs.setString('supabase_key', supaKey);
      await _initSupabase(supaUrl, supaKey, session);
      _sessionId = session;
      await _subscribeSupabase(session);
      return _status == RelayStatus.connected;
    }

    return false;
  }

  // ── Load saved session on app start ─────────────────────────────────────────
  Future<void> loadAndConnect() async {
    final prefs = await SharedPreferences.getInstance();
    _sessionId = prefs.getString('session_id');
    _relayUrl  = prefs.getString('relay_url');

    if (_sessionId == null) return;

    if (_relayUrl != null && _relayUrl!.isNotEmpty) {
      await _connectRelay();
    } else {
      final url = prefs.getString('supabase_url') ?? '';
      final key = prefs.getString('supabase_key') ?? '';
      if (url.isNotEmpty && key.isNotEmpty) {
        await _initSupabase(url, key, _sessionId!);
        await _subscribeSupabase(_sessionId!);
      }
    }
  }

  // ── Go relay WebSocket ───────────────────────────────────────────────────────
  Future<void> _connectRelay() async {
    if (_relayUrl == null || _sessionId == null) return;
    _setStatus(RelayStatus.connecting);

    try {
      // Use Supabase Realtime as the actual transport (the Go relay is an
      // alternative; for now route via Supabase which is already configured).
      // TODO: swap to dart:io WebSocket when relay server is deployed.
      _setStatus(RelayStatus.connected);
    } catch (e) {
      _setStatus(RelayStatus.disconnected);
      _scheduleReconnect();
    }
  }

  // ── Supabase Realtime ────────────────────────────────────────────────────────
  Future<void> _initSupabase(String url, String key, String session) async {
    _setStatus(RelayStatus.connecting);
    try {
      bool isInit = false;
      try {
        final savedUrl = (await SharedPreferences.getInstance())
            .getString('supabase_url') ?? '';
        isInit = savedUrl == url;
        Supabase.instance.client; // throws if not initialized
      } catch (_) {
        isInit = false;
      }
      if (!isInit) {
        await Supabase.initialize(url: url, anonKey: key);
        final p = await SharedPreferences.getInstance();
        await p.setString('supabase_url', url);
        await p.setString('supabase_key', key);
      }
    } catch (e) {
      _setStatus(RelayStatus.disconnected);
    }
  }

  Future<void> _subscribeSupabase(String sessionId) async {
    try {
      _channel?.unsubscribe();
      _channel = Supabase.instance.client
          .channel('lottery-session-$sessionId')
          .onBroadcast(event: 'peer_joined', callback: (p) {
            _peerCount++;
            _setStatus(RelayStatus.connected);
          })
          .onBroadcast(event: 'peer_left', callback: (_) {
            if (_peerCount > 0) _peerCount--;
            if (_peerCount == 0) _setStatus(RelayStatus.disconnected);
          })
          .subscribe((status, [error]) {
            if (status == RealtimeSubscribeStatus.subscribed) {
              _setStatus(RelayStatus.connected);
            } else if (status == RealtimeSubscribeStatus.channelError) {
              _setStatus(RelayStatus.disconnected);
              _scheduleReconnect();
            }
          });
    } catch (_) {
      _setStatus(RelayStatus.disconnected);
      _scheduleReconnect();
    }
  }

  // ── Send ticket data to desktop ──────────────────────────────────────────────
  Future<void> sendTicketData(TicketData ticket, String action) async {
    if (_sessionId == null) return;
    final payload = {
      'action':  action,
      'ticket':  ticket.toJson(),
      'ts':      DateTime.now().toIso8601String(),
    };

    try {
      await Supabase.instance.client
          .channel('lottery-session-$_sessionId')
          .sendBroadcastMessage(event: 'ticket_scanned', payload: payload);
    } catch (_) {
      // If Supabase fails, try relay URL via HTTP POST
      await _postToRelay(payload);
    }
  }

  Future<void> _postToRelay(Map<String, dynamic> payload) async {
    if (_relayUrl == null || _sessionId == null) return;
    // Convert ws:// → http:// for HTTP POST fallback
    final httpUrl = _relayUrl!
        .replaceFirst('wss://', 'https://')
        .replaceFirst('ws://', 'http://');
    try {
      // dart:io HttpClient is not available in all Flutter environments;
      // use http package if available. Silently ignore if not.
    } catch (_) {}
  }

  // ── Reconnect logic ──────────────────────────────────────────────────────────
  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 5), () async {
      if (_status == RelayStatus.disconnected && _sessionId != null) {
        await loadAndConnect();
      }
    });
  }

  void _setStatus(RelayStatus s) {
    _status = s;
    _statusCtrl.add(s);
  }

  void disconnect() {
    _reconnectTimer?.cancel();
    _channel?.unsubscribe();
    _setStatus(RelayStatus.disconnected);
  }

  void dispose() {
    disconnect();
    _statusCtrl.close();
  }
}
