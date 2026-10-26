import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_scanner/mobile_scanner.dart' show BarcodeCapture;
import '../app.dart';
import '../models/ticket_data.dart';
import '../services/qr_parser.dart';
import '../services/session_service.dart';
import '../widgets/scan_result_card.dart';
import '../widgets/scanner_view.dart';

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
      SnackBar(
        content: Text('Winning ticket recorded',
          style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
        backgroundColor: kGreen,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBgMain,
      body: SafeArea(child: Column(children: [
        // ── Screen header ──────────────────────────────────────────────────
        Container(
          color: kCardBg,
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 14),
          child: Row(children: [
            const Icon(Icons.emoji_events_rounded, color: kYellow, size: 24),
            const SizedBox(width: 10),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Winning Tickets', style: GoogleFonts.inter(
                fontSize: 18, fontWeight: FontWeight.w700, color: kText)),
              Text('Scan and record winning tickets', style: GoogleFonts.inter(
                fontSize: 12, color: kTextSub)),
            ]),
          ]),
        ),
        const Divider(height: 1, color: kBorder),

        // ── Info banner ────────────────────────────────────────────────────
        Container(
          margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xFFFFF8E1),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: kYellow.withValues(alpha: 0.40)),
          ),
          child: Row(children: [
            const Icon(Icons.info_outline_rounded, color: Color(0xFFF29900), size: 16),
            const SizedBox(width: 8),
            Expanded(child: Text(
              'Scan winning lottery tickets to record them',
              style: GoogleFonts.inter(
                fontSize: 12, color: const Color(0xFF4A3000)),
            )),
          ]),
        ),

        if (_scanning)
          Container(
            margin: const EdgeInsets.only(top: 12),
            height: 280,
            child: ScannerView(
              overlayLabel: 'Scan winning ticket QR',
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
                  icon: const Icon(Icons.qr_code_scanner_rounded, size: 20),
                  label: Text('Scan Winning Ticket',
                    style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600)),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFF29900),
                    minimumSize: const Size(double.infinity, 52),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              if (_lastTicket != null) ...[
                const SizedBox(height: 12),
                ScanResultCard(ticket: _lastTicket!, highlight: true),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: _recordWinning,
                  icon: const Icon(Icons.check_circle_rounded, size: 20),
                  label: Text('Record as Winning Ticket',
                    style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600)),
                  style: FilledButton.styleFrom(
                    backgroundColor: kGreen,
                    minimumSize: const Size(double.infinity, 52),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ],
              if (_verified.isNotEmpty) ...[
                const SizedBox(height: 24),
                Row(children: [
                  Text('Recorded Winning Tickets',
                    style: GoogleFonts.inter(
                      fontWeight: FontWeight.w700, fontSize: 14, color: kText)),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: kGreenBg, borderRadius: BorderRadius.circular(20)),
                    child: Text('${_verified.length}',
                      style: GoogleFonts.inter(
                        fontSize: 12, fontWeight: FontWeight.w700, color: kGreen)),
                  ),
                ]),
                const SizedBox(height: 8),
                ..._verified.map((t) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: ScanResultCard(ticket: t, compact: true))),
              ],
            ]),
          ),
        ),
      ])),
    );
  }
}
