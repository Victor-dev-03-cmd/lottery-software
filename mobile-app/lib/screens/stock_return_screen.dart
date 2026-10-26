import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
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
        SnackBar(
          content: Text('Sent to desktop',
            style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
          backgroundColor: kGreen,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBgMain,
      body: SafeArea(child: Column(children: [
        // ── Screen header ────────────────────────────────────────────────────
        Container(
          color: kCardBg,
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 14),
          child: Row(children: [
            const Icon(Icons.assignment_return_rounded, color: kPrimary, size: 22),
            const SizedBox(width: 10),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Returns', style: GoogleFonts.inter(
                fontSize: 18, fontWeight: FontWeight.w700, color: kText)),
              Text('Return unsold tickets', style: GoogleFonts.inter(
                fontSize: 12, color: kTextSub)),
            ]),
          ]),
        ),
        const Divider(height: 1, color: kBorder),

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
                FilledButton.icon(
                  onPressed: () => setState(() { _scanning = true; _lastTicket = null; }),
                  icon: const Icon(Icons.qr_code_scanner, size: 20),
                  label: const Text('Scan Return Ticket'),
                  style: FilledButton.styleFrom(
                    backgroundColor: kRed,
                    minimumSize: const Size(double.infinity, 52),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    textStyle: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                ),
              const SizedBox(height: 16),
              if (_lastTicket != null) ...[
                ScanResultCard(ticket: _lastTicket!),
                const SizedBox(height: 12),
                TextField(
                  controller: _reasonCtrl,
                  style: GoogleFonts.inter(fontSize: 14),
                  decoration: InputDecoration(
                    labelText: 'Return Reason',
                    prefixIcon: const Icon(Icons.notes_rounded, size: 20),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: kPrimary, width: 1.5)),
                    filled: true, fillColor: kCardBg,
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: _sending ? null : _sendToDesktop,
                  icon: _sending
                      ? const SizedBox(width: 18, height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.send_rounded, size: 18),
                  label: Text(_sending ? 'Sending…' : 'Send Return to Desktop',
                    style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600)),
                  style: FilledButton.styleFrom(
                    backgroundColor: kGreen,
                    minimumSize: const Size(double.infinity, 52),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ],
            ]),
          ),
        ),
      ])),
    );
  }

  @override
  void dispose() { _reasonCtrl.dispose(); super.dispose(); }
}
