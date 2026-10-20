import 'dart:async';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import '../models/ticket_data.dart';

class SessionService {
  static final SessionService _instance = SessionService._();
  factory SessionService() => _instance;
  SessionService._();

  String? _sessionId;
  RealtimeChannel? _channel;
  final _ticketController = StreamController<TicketData>.broadcast();
  bool _connected = false;

  String? get sessionId => _sessionId;
  bool get connected => _connected;
  Stream<TicketData> get ticketStream => _ticketController.stream;

  /// Generate a new session ID for pairing
  String generateSession() {
    _sessionId = const Uuid().v4().substring(0, 8).toUpperCase();
    return _sessionId!;
  }

  /// Join an existing session (from QR scan on desktop)
  Future<bool> joinSession(String sessionId, String supabaseUrl, String supabaseAnonKey) async {
    try {
      final prefs = await SharedPreferences.getInstance();

      // Compare against the URL we stored ourselves — SupabaseClient
      // doesn't expose the URL as a public getter in v2.x.
      final savedUrl = prefs.getString('supabase_url') ?? '';
      bool isInitialized = false;
      try {
        Supabase.instance.client; // throws StateError if not yet initialized
        isInitialized = true;
      } catch (_) {
        isInitialized = false;
      }

      if (!isInitialized || savedUrl != supabaseUrl) {
        await Supabase.initialize(url: supabaseUrl, anonKey: supabaseAnonKey);
        await prefs.setString('supabase_url', supabaseUrl);
        await prefs.setString('supabase_key', supabaseAnonKey);
      }

      _sessionId = sessionId;
      await _subscribeToChannel(sessionId);
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<void> _subscribeToChannel(String sessionId) async {
    _channel?.unsubscribe();
    _channel = Supabase.instance.client
        .channel('lottery-session-$sessionId')
        .onBroadcast(event: 'ticket_scanned', callback: (payload) {
          // Desktop → phone: acknowledge
        })
        .subscribe();
    _connected = true;
  }

  /// Send parsed ticket data to desktop via Supabase Realtime
  Future<void> sendTicketData(TicketData ticket, String action) async {
    if (_sessionId == null) return;
    try {
      await Supabase.instance.client
          .channel('lottery-session-$_sessionId')
          .sendBroadcastMessage(
            event: 'ticket_scanned',
            payload: {
              'action': action,   // 'stock_purchase' | 'stock_return' | 'invoice' | 'winning'
              'ticket': ticket.toJson(),
            },
          );
    } catch (_) {}
  }

  void dispose() {
    _channel?.unsubscribe();
    _ticketController.close();
  }
}
