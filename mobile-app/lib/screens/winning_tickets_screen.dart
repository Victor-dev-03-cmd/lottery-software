import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../app.dart';
import '../models/ticket_data.dart';
import '../services/qr_parser.dart';
import '../services/session_service.dart';
import '../widgets/scan_result_card.dart';
import '../widgets/scanner_overlay.dart';

class WinningTicketsScreen extends StatefulWidget {
  const WinningTicketsScreen({super.key});
  @override
  State<WinningTicketsScreen> createState() => _WinningTicketsScreenState();
}

class _WinningTicketsScreenState extends State<WinningTicketsScreen> {
  bool _scanning = false;
  TicketData? _lastTicket;
  final List<TicketData> _verified = [];

  void _onDetect(BarcodeCapture capture) {
    final value = capture.barcodes.firstOrNull?.rawValue;
    if (value == null) return;
    final ticket = QRParser.parse(value);
    if (ticket == null) return;
    HapticFeedback.heavyImpact();
    setState(() { _lastTicket = ticket; _scanning = false; });
  }

  Future<void> _recordWinning() async {
    if (_lastTicket == null) return;
    await SessionService().sendTicketData(_lastTicket!, 'winning');
    setState(() { _verified.insert(0, _lastTicket!); _lastTicket = null; });
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Winning ticket recorded'), backgroundColor: Colors.green),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBg,
      body: Column(children: [
        Container(
          padding: const EdgeInsets.all(12),
          color: const Color(0xFFFFFBEB),
          child: const Row(children: [
            Icon(Icons.star, color: Color(0xFFD97706)),
            SizedBox(width: 8),
            Text('Scan winning lottery tickets to record them',
              style: TextStyle(fontSize: 12, color: Color(0xFF92400E))),
          ]),
        ),
        if (_scanning)
          SizedBox(
            height: 280,
            child: Stack(children: [
              MobileScanner(onDetect: _onDetect),
              const ScannerOverlay(label: 'Scan winning ticket QR'),
              Positioned(top: 8, right: 8,
                child: IconButton(icon: const Icon(Icons.close, color: Colors.white), onPressed: () => setState(() => _scanning = false))),
            ]),
          ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              if (!_scanning)
                ElevatedButton.icon(
                  onPressed: () => setState(() { _scanning = true; _lastTicket = null; }),
                  icon: const Icon(Icons.qr_code_scanner),
                  label: const Text('Scan Winning Ticket'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFD97706), foregroundColor: Colors.white,
                    minimumSize: const Size(double.infinity, 48),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              if (_lastTicket != null) ...[
                const SizedBox(height: 12),
                ScanResultCard(ticket: _lastTicket!, highlight: true),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _recordWinning,
                    icon: const Icon(Icons.check_circle),
                    label: const Text('Record as Winning Ticket'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF16A34A), foregroundColor: Colors.white,
                      minimumSize: const Size(double.infinity, 50),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
              ],
              if (_verified.isNotEmpty) ...[
                const SizedBox(height: 20),
                Row(children: [
                  const Text('Recorded Winning Tickets', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                  const Spacer(),
                  Text('${_verified.length}', style: const TextStyle(color: kPrimary, fontWeight: FontWeight.w800)),
                ]),
                const SizedBox(height: 8),
                ..._verified.map((t) => ScanResultCard(ticket: t, compact: true)),
              ],
            ]),
          ),
        ),
      ]),
    );
  }
}
