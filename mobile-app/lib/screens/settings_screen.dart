import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart' show BarcodeCapture;
import '../app.dart';
import '../services/session_service.dart';
import '../widgets/scanner_view.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  RelayStatus _status = RelayStatus.disconnected;
  late final StreamSubscription<RelayStatus> _sub;

  bool _scanning = false;
  bool _pairing  = false;
  String? _pairMessage;
  bool _pairError = false;

  // Manual IP entry
  final _ipCtrl = TextEditingController();
  bool _connecting = false;

  @override
  void initState() {
    super.initState();
    _status = SessionService().status;
    _sub = SessionService().statusStream.listen((s) {
      if (mounted) setState(() => _status = s);
    });
    final host = SessionService().desktopHost ?? '';
    _ipCtrl.text = host.replaceAll(':7423', '');
  }

  @override
  void dispose() {
    _sub.cancel();
    _ipCtrl.dispose();
    super.dispose();
  }

  // ── QR scan pairing ──────────────────────────────────────────────────────────

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_pairing) return;
    final value = capture.barcodes.firstOrNull?.rawValue;
    if (value == null) return;
    final uri = Uri.tryParse(value);
    if (uri == null || uri.scheme != 'lottery') return;

    setState(() { _pairing = true; _pairMessage = 'Connecting…'; _pairError = false; });

    final ok = await SessionService().joinFromQR(value);
    if (!mounted) return;

    if (ok) {
      setState(() {
        _scanning    = false;
        _pairing     = false;
        _pairMessage = 'Paired! Connected to ${SessionService().desktopHost ?? 'desktop'}';
        _pairError   = false;
        _ipCtrl.text = (SessionService().desktopHost ?? '').replaceAll(':7423', '');
      });
    } else {
      setState(() {
        _pairing    = false;
        _pairMessage = 'Could not reach desktop — check WiFi and try again';
        _pairError   = true;
      });
    }
  }

  // ── Manual IP connect ────────────────────────────────────────────────────────

  Future<void> _connectManual() async {
    final ip = _ipCtrl.text.trim();
    if (ip.isEmpty) return;
    HapticFeedback.lightImpact();
    setState(() { _connecting = true; _pairMessage = null; });

    final ok = await SessionService().joinFromQR('lottery://pair?host=$ip:7423');
    if (!mounted) return;

    setState(() {
      _connecting = false;
      _pairMessage = ok
          ? 'Connected to $ip'
          : 'Could not reach $ip — check IP and WiFi';
      _pairError = !ok;
    });
  }

  // ── Disconnect ──────────────────────────────────────────────────────────────

  void _disconnect() {
    SessionService().disconnect();
    setState(() { _pairMessage = 'Disconnected'; _pairError = false; });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  Color get _connColor => switch (_status) {
    RelayStatus.connected    => const Color(0xFF16A34A),
    RelayStatus.connecting   => const Color(0xFFF59E0B),
    RelayStatus.disconnected => const Color(0xFFEF4444),
  };

  String get _connLabel => switch (_status) {
    RelayStatus.connected    => 'Connected to Desktop',
    RelayStatus.connecting   => 'Connecting…',
    RelayStatus.disconnected => 'Not Connected',
  };

  // ── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBg,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            pinned: true,
            backgroundColor: kDark,
            elevation: 0,
            title: const Text('Settings',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white)),
            centerTitle: false,
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                // ── Connection status ──────────────────────────────────────────
                _buildStatusCard(),
                const SizedBox(height: 20),

                // ── QR scanner ────────────────────────────────────────────────
                _buildPairSection(),
                const SizedBox(height: 20),

                // ── Manual IP ─────────────────────────────────────────────────
                _buildManualSection(),
                const SizedBox(height: 20),

                // ── App info ──────────────────────────────────────────────────
                _buildAppInfo(),
                const SizedBox(height: 32),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  // ── Status card ─────────────────────────────────────────────────────────────

  Widget _buildStatusCard() {
    final session = SessionService();
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _connColor.withOpacity(0.25)),
        boxShadow: [
          BoxShadow(color: _connColor.withOpacity(0.07), blurRadius: 14, offset: const Offset(0, 4)),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              color: _connColor.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              _status == RelayStatus.connected ? Icons.wifi_rounded : Icons.wifi_off_rounded,
              color: _connColor, size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_connLabel, style: TextStyle(
              color: _connColor, fontWeight: FontWeight.w800, fontSize: 13)),
            if (session.desktopHost != null)
              Text(session.desktopHost!, style: const TextStyle(
                color: kGrey, fontSize: 11), maxLines: 1, overflow: TextOverflow.ellipsis),
            if (session.sessionId != null && session.desktopHost == null)
              Text('Session: ${session.sessionId!}', style: const TextStyle(
                color: kGrey, fontSize: 11)),
          ])),
          if (_status == RelayStatus.connected)
            TextButton(
              onPressed: _disconnect,
              style: TextButton.styleFrom(
                foregroundColor: const Color(0xFFEF4444),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              ),
              child: const Text('Disconnect', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
            ),
        ]),

        // Feedback message
        if (_pairMessage != null) ...[
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: _pairError
                  ? const Color(0xFFFEF2F2)
                  : const Color(0xFFF0FDF4),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: _pairError
                    ? const Color(0xFFFECACA)
                    : const Color(0xFFBBF7D0),
              ),
            ),
            child: Row(children: [
              Icon(
                _pairError ? Icons.error_outline_rounded : Icons.check_circle_outline_rounded,
                size: 15,
                color: _pairError ? const Color(0xFFDC2626) : const Color(0xFF16A34A),
              ),
              const SizedBox(width: 8),
              Expanded(child: Text(
                _pairMessage!,
                style: TextStyle(
                  fontSize: 11,
                  color: _pairError ? const Color(0xFFDC2626) : const Color(0xFF15803D),
                  fontWeight: FontWeight.w500,
                ),
              )),
            ]),
          ),
        ],
      ]),
    );
  }

  // ── QR pairing section ───────────────────────────────────────────────────────

  Widget _buildPairSection() {
    return _SettingsCard(
      title: 'Pair with Desktop',
      subtitle: 'Open Desktop → Settings → Mobile App, then scan the QR code',
      accentColor: kPrimary,
      icon: Icons.qr_code_scanner_rounded,
      child: Column(children: [
        const SizedBox(height: 10),

        // Inline scanner
        AnimatedContainer(
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeInOut,
          height: _scanning ? 240 : 0,
          clipBehavior: Clip.hardEdge,
          decoration: const BoxDecoration(),
          child: _scanning
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: ScannerView(
                    overlayLabel: 'Point at the desktop pairing QR',
                    onDetect: _onDetect,
                    onClose: () => setState(() => _scanning = false),
                    qrOnly: false,
                  ),
                )
              : const SizedBox.shrink(),
        ),

        if (_scanning) const SizedBox(height: 10),

        // Scan / Cancel button
        SizedBox(
          width: double.infinity,
          child: _pairing
              ? const Center(child: Padding(
                  padding: EdgeInsets.all(8),
                  child: CircularProgressIndicator(color: kPrimary, strokeWidth: 2)))
              : FilledButton.icon(
                  onPressed: () => setState(() {
                    _scanning = !_scanning;
                    _pairMessage = null;
                  }),
                  icon: Icon(_scanning ? Icons.close : Icons.qr_code_scanner),
                  label: Text(_scanning ? 'Cancel' : 'Scan Desktop QR Code'),
                  style: FilledButton.styleFrom(
                    backgroundColor: _scanning ? kGrey : kPrimary,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    padding: const EdgeInsets.symmetric(vertical: 13),
                  ),
                ),
        ),
      ]),
    );
  }

  // ── Manual IP section ────────────────────────────────────────────────────────

  Widget _buildManualSection() {
    return _SettingsCard(
      title: 'Connect by IP Address',
      subtitle: 'Enter the desktop LAN IP shown in Desktop → Settings → Mobile App',
      accentColor: const Color(0xFF2563EB),
      icon: Icons.lan_rounded,
      child: Column(children: [
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: TextField(
              controller: _ipCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: const TextStyle(
                fontFamily: 'monospace', fontSize: 14, fontWeight: FontWeight.w600),
              decoration: InputDecoration(
                hintText: '192.168.x.x',
                hintStyle: TextStyle(color: kGrey.withOpacity(0.5), fontFamily: 'monospace'),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                filled: true,
                fillColor: const Color(0xFFF9FAFB),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(9),
                  borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(9),
                  borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(9),
                  borderSide: const BorderSide(color: kPrimary, width: 1.5),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: _connecting ? null : _connectManual,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF2563EB),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
            ),
            child: _connecting
                ? const SizedBox(width: 18, height: 18,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                : const Text('Connect', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          ),
        ]),
        const SizedBox(height: 6),
        const Text(
          'Port 7423 is appended automatically.',
          style: TextStyle(fontSize: 10, color: kGrey),
        ),
      ]),
    );
  }

  // ── App info ─────────────────────────────────────────────────────────────────

  Widget _buildAppInfo() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE8E8E8)),
      ),
      child: Column(children: [
        _InfoRow('App', 'Lottery Scanner — Ajith Rohana Enterprise'),
        const Divider(height: 16, color: Color(0xFFF3F4F6)),
        _InfoRow('Scan support', 'NLB · DLB (QR code)'),
        const Divider(height: 16, color: Color(0xFFF3F4F6)),
        _InfoRow('Sync', 'Local LAN (HTTP) + Cloud relay (WebSocket)'),
      ]),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 90,
          child: Text(label, style: const TextStyle(
            fontSize: 11, color: kGrey, fontWeight: FontWeight.w600)),
        ),
        Expanded(child: Text(value, style: const TextStyle(
          fontSize: 11, color: kDark, fontWeight: FontWeight.w600))),
      ],
    );
  }
}

// ── Reusable settings card ────────────────────────────────────────────────────

class _SettingsCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final Color accentColor;
  final IconData icon;
  final Widget child;

  const _SettingsCard({
    required this.title,
    required this.subtitle,
    required this.accentColor,
    required this.icon,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE8E8E8)),
        boxShadow: const [
          BoxShadow(color: Color(0x06000000), blurRadius: 8, offset: Offset(0, 3)),
        ],
      ),
      child: Column(children: [
        // Header bar
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            border: Border(
              bottom: const BorderSide(color: Color(0xFFF3F4F6)),
              left: BorderSide(color: accentColor, width: 3),
            ),
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(16),
              topRight: Radius.circular(16),
            ),
          ),
          child: Row(children: [
            Icon(icon, color: accentColor, size: 18),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(
                fontWeight: FontWeight.w800, fontSize: 13, color: kDark)),
              const SizedBox(height: 2),
              Text(subtitle, style: const TextStyle(fontSize: 10, color: kGrey)),
            ])),
          ]),
        ),
        // Body
        Padding(
          padding: const EdgeInsets.all(14),
          child: child,
        ),
      ]),
    );
  }
}
