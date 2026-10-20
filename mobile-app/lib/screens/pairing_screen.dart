import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../services/session_service.dart';
import '../app.dart';

class PairingScreen extends StatefulWidget {
  const PairingScreen({super.key});
  @override
  State<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends State<PairingScreen> {
  bool _scanning = false;
  bool _pairing = false;
  String _status = 'Scan the QR code shown on your desktop Lottery app\n(Settings → Backup & Security → Mobile Companion)';

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_pairing) return;
    final barcode = capture.barcodes.firstOrNull;
    final value = barcode?.rawValue;
    if (value == null) return;

    // Expected: lottery://pair?session=XXXX&url=https://...&key=eyJ...
    final uri = Uri.tryParse(value);
    if (uri == null || uri.scheme != 'lottery' || uri.host != 'pair') return;

    final session = uri.queryParameters['session'] ?? '';
    final url     = uri.queryParameters['url']     ?? '';
    final key     = uri.queryParameters['key']     ?? '';

    if (session.isEmpty || url.isEmpty || key.isEmpty) {
      setState(() => _status = 'Invalid pairing QR — try again');
      return;
    }

    setState(() { _pairing = true; _status = 'Connecting…'; });

    final ok = await SessionService().joinSession(session, url, key);

    if (!mounted) return;
    if (ok) {
      setState(() => _status = 'Connected to desktop (session $session)');
      await Future.delayed(const Duration(seconds: 1));
      if (mounted) Navigator.of(context).pushReplacementNamed('/main');
    } else {
      setState(() { _pairing = false; _status = 'Connection failed — check Supabase settings'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kDark,
      appBar: AppBar(
        title: const Text('Pair with Desktop'),
        backgroundColor: kDark,
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pushReplacementNamed('/main'),
            child: const Text('Skip', style: TextStyle(color: Colors.white60)),
          ),
        ],
      ),
      body: Column(children: [
        Expanded(
          flex: 2,
          child: _scanning
            ? MobileScanner(onDetect: _onDetect)
            : Container(
                color: Colors.black87,
                child: Center(
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Icon(Icons.qr_code_scanner, size: 80, color: kPrimary.withOpacity(0.7)),
                    const SizedBox(height: 16),
                    const Text('Pair with desktop', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    const Text('Connect over any network (WiFi, 4G, 5G)',
                      style: TextStyle(color: Colors.white54, fontSize: 12), textAlign: TextAlign.center),
                  ]),
                ),
              ),
        ),
        Container(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            Text(_status, style: const TextStyle(color: Colors.white70, fontSize: 13), textAlign: TextAlign.center),
            const SizedBox(height: 20),
            if (!_pairing) ...[
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => setState(() => _scanning = !_scanning),
                  icon: Icon(_scanning ? Icons.close : Icons.qr_code_scanner),
                  label: Text(_scanning ? 'Cancel Scan' : 'Scan Desktop QR'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: kPrimary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ),
            ] else
              const CircularProgressIndicator(color: kPrimary),
          ]),
        ),
      ]),
    );
  }
}
