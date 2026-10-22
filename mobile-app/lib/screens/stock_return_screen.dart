import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart' show BarcodeCapture;
import 'package:vibration/vibration.dart';
import '../app.dart';
import '../models/ticket_data.dart';
import '../services/qr_parser.dart';
import '../services/session_service.dart';
import '../widgets/scan_result_card.dart';
import '../widgets/scanner_view.dart';

class StockReturnScreen extends StatefulWidget {
  const StockReturnScreen({super.key});
  @override
  State<StockReturnScreen> createState() => _StockReturnScreenState();
}

class _StockReturnScreenState extends State<StockReturnScreen> {
  bool _scanning = false;
  TicketData? _lastTicket;
  final _reasonCtrl = TextEditingController(text: 'Unsold');
  bool _sending = false;

  void _onDetect(BarcodeCapture capture) {
    final value = capture.barcodes.firstOrNull?.rawValue;
    if (value == null) return;
    final ticket = QRParser.parse(value);
    if (ticket == null) return;
    HapticFeedback.mediumImpact();
    Vibration.vibrate(duration: 80);
    setState(() { _lastTicket = ticket; _scanning = false; });
  }

  Future<void> _sendToDesktop() async {
    if (_lastTicket == null) return;
    setState(() => _sending = true);
    await SessionService().sendTicketData(_lastTicket!, 'stock_return');
    if (mounted) {
      setState(() => _sending = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sent to desktop'), backgroundColor: Colors.green),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBg,
      body: SafeArea(child: Column(children: [
        if (_scanning)
          SizedBox(
            height: 280,
            child: ScannerView(
              overlayLabel: 'Scan return ticket QR',
              onDetect: _onDetect,
              onClose: () => setState(() => _scanning = false),
            ),
          ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              if (!_scanning)
                ElevatedButton.icon(
                  onPressed: () => setState(() { _scanning = true; _lastTicket = null; }),
                  icon: const Icon(Icons.qr_code_scanner),
                  label: const Text('Scan Return Ticket'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFEA580C),
                    foregroundColor: Colors.white,
                    minimumSize: const Size(double.infinity, 48),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              const SizedBox(height: 16),
              if (_lastTicket != null) ...[
                ScanResultCard(ticket: _lastTicket!),
                const SizedBox(height: 12),
                TextField(
                  controller: _reasonCtrl,
                  decoration: InputDecoration(
                    labelText: 'Return Reason',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: kPrimary)),
                    filled: true, fillColor: Colors.white,
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _sending ? null : _sendToDesktop,
                    icon: const Icon(Icons.send),
                    label: Text(_sending ? 'Sending…' : 'Send Return to Desktop'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: kPrimary, foregroundColor: Colors.white,
                      minimumSize: const Size(double.infinity, 50),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
              ],
            ]),
          ),
        ),
      ])), // SafeArea + Column
    );
  }

  @override
  void dispose() { _reasonCtrl.dispose(); super.dispose(); }
}
