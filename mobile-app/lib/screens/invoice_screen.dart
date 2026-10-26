import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_scanner/mobile_scanner.dart' show BarcodeCapture;
import 'package:vibration/vibration.dart';
import '../app.dart';
import '../models/ticket_data.dart';
import '../services/qr_parser.dart';
import '../services/session_service.dart';
import '../widgets/scan_result_card.dart';
import '../widgets/scanner_view.dart';

class InvoiceScreen extends StatefulWidget {
  const InvoiceScreen({super.key});
  @override
  State<InvoiceScreen> createState() => _InvoiceScreenState();
}

class _InvoiceScreenState extends State<InvoiceScreen> {
  bool _scanning = false;
  final List<TicketData> _items = [];
  bool _sending = false;

  void _onDetect(BarcodeCapture capture) {
    final value = capture.barcodes.firstOrNull?.rawValue;
    if (value == null) return;
    final ticket = QRParser.parse(value);
    if (ticket == null) return;
    if (_items.any((t) => t.serialNumber == ticket.serialNumber)) return;
    Vibration.vibrate(duration: 60);
    setState(() { _items.insert(0, ticket); });
  }

  Future<void> _sendAllToDesktop() async {
    if (_items.isEmpty) return;
    setState(() => _sending = true);
    for (final ticket in _items) {
      await SessionService().sendTicketData(ticket, 'invoice');
    }
    if (mounted) {
      setState(() => _sending = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${_items.length} items sent to desktop',
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
        // ── Screen header ──────────────────────────────────────────────────
        Container(
          color: kCardBg,
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 10),
          child: Row(children: [
            const Icon(Icons.receipt_long_rounded, color: kPrimary, size: 22),
            const SizedBox(width: 10),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Invoice', style: GoogleFonts.inter(
                  fontSize: 18, fontWeight: FontWeight.w700, color: kText)),
                Text('Scan tickets for agent invoices', style: GoogleFonts.inter(
                  fontSize: 12, color: kTextSub)),
              ],
            )),
            if (_items.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: kBlueLight, borderRadius: BorderRadius.circular(20)),
                child: Text('${_items.length}',
                  style: GoogleFonts.inter(
                    fontSize: 12, fontWeight: FontWeight.w700, color: kPrimary)),
              ),
          ]),
        ),
        const Divider(height: 1, color: kBorder),

        // ── Action bar ─────────────────────────────────────────────────────
        Container(
          color: kCardBg,
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: Row(children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: () => setState(() => _scanning = !_scanning),
                icon: Icon(_scanning ? Icons.stop_rounded : Icons.qr_code_scanner_rounded,
                  size: 18),
                label: Text(_scanning ? 'Stop Scanning' : 'Scan Tickets',
                  style: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600)),
                style: FilledButton.styleFrom(
                  backgroundColor: _scanning ? const Color(0xFFF29900) : kPrimary,
                  minimumSize: const Size(0, 46),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ),
            if (_items.isNotEmpty) ...[
              const SizedBox(width: 10),
              FilledButton.icon(
                onPressed: _sending ? null : _sendAllToDesktop,
                icon: _sending
                    ? const SizedBox(width: 16, height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.send_rounded, size: 16),
                label: Text('Send ${_items.length}',
                  style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600)),
                style: FilledButton.styleFrom(
                  backgroundColor: kGreen,
                  minimumSize: const Size(0, 46),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ],
          ]),
        ),
        const Divider(height: 1, color: kBorder),

        if (_scanning)
          SizedBox(
            height: 260,
            child: ScannerView(
              overlayLabel: 'Scan tickets for invoice',
              onDetect: _onDetect,
              onClose: () => setState(() => _scanning = false),
            ),
          ),

        Expanded(
          child: _items.isEmpty
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.receipt_long_outlined, size: 56,
                    color: kTextSub.withValues(alpha: 0.35)),
                  const SizedBox(height: 12),
                  Text('No tickets scanned yet',
                    style: GoogleFonts.inter(color: kTextSub, fontSize: 14)),
                  const SizedBox(height: 4),
                  Text('Tap Scan Tickets to begin',
                    style: GoogleFonts.inter(color: kTextSub.withValues(alpha: 0.6),
                      fontSize: 12)),
                ]))
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  itemCount: _items.length,
                  itemBuilder: (_, i) => Dismissible(
                    key: Key(_items[i].serialNumber),
                    direction: DismissDirection.endToStart,
                    onDismissed: (_) => setState(() => _items.removeAt(i)),
                    background: Container(
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      decoration: BoxDecoration(
                        color: kRed.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      alignment: Alignment.centerRight,
                      padding: const EdgeInsets.only(right: 16),
                      child: const Icon(Icons.delete_rounded, color: kRed),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: ScanResultCard(ticket: _items[i], compact: true),
                    ),
                  ),
                ),
        ),
      ])),
    );
  }
}
