import 'package:flutter/material.dart';
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
    if (_items.any((t) => t.serialNumber == ticket.serialNumber)) return; // dedup
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
        SnackBar(content: Text('${_items.length} items sent to desktop'), backgroundColor: Colors.green),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBg,
      body: Column(children: [
        if (_scanning)
          SizedBox(
            height: 260,
            child: ScannerView(
              overlayLabel: 'Scan tickets for invoice',
              onDetect: _onDetect,
              onClose: () => setState(() => _scanning = false),
            ),
          ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () => setState(() => _scanning = !_scanning),
                icon: Icon(_scanning ? Icons.stop : Icons.qr_code_scanner),
                label: Text(_scanning ? 'Stop Scanning' : 'Scan Tickets'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _scanning ? Colors.orange : kPrimary,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
            ),
            const SizedBox(width: 8),
            if (_items.isNotEmpty)
              ElevatedButton.icon(
                onPressed: _sending ? null : _sendAllToDesktop,
                icon: const Icon(Icons.send),
                label: Text('Send ${_items.length}'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF16A34A), foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
          ]),
        ),
        Expanded(
          child: _items.isEmpty
            ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(Icons.receipt_long_outlined, size: 56, color: kGrey.withOpacity(0.4)),
                const SizedBox(height: 12),
                const Text('No tickets scanned yet', style: TextStyle(color: kGrey)),
              ]))
            : ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                itemCount: _items.length,
                itemBuilder: (_, i) => Dismissible(
                  key: Key(_items[i].serialNumber),
                  onDismissed: (_) => setState(() => _items.removeAt(i)),
                  background: Container(color: Colors.red, alignment: Alignment.centerRight,
                    padding: const EdgeInsets.only(right: 16),
                    child: const Icon(Icons.delete, color: Colors.white)),
                  child: ScanResultCard(ticket: _items[i], compact: true),
                ),
              ),
        ),
      ]),
    );
  }
}
