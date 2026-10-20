import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:vibration/vibration.dart';
import '../app.dart';
import '../models/ticket_data.dart';
import '../services/qr_parser.dart';
import '../services/session_service.dart';
import '../widgets/scan_result_card.dart';
import '../widgets/scanner_overlay.dart';

class StockPurchaseScreen extends StatefulWidget {
  const StockPurchaseScreen({super.key});
  @override
  State<StockPurchaseScreen> createState() => _StockPurchaseScreenState();
}

class _StockPurchaseScreenState extends State<StockPurchaseScreen> {
  bool _scanning = false;
  TicketData? _lastTicket;
  String? _error;
  final _barcodeStartCtrl = TextEditingController();
  final _barcodeEndCtrl   = TextEditingController();
  final _qtyCtrl          = TextEditingController();
  final _priceCtrl        = TextEditingController(text: '32.50');
  final List<TicketData> _scanned = [];
  bool _sending = false;

  void _onDetect(BarcodeCapture capture) {
    final value = capture.barcodes.firstOrNull?.rawValue;
    if (value == null) return;
    final ticket = QRParser.parse(value);
    if (ticket == null) {
      setState(() { _error = 'Could not read ticket data from this QR code'; });
      return;
    }
    HapticFeedback.mediumImpact();
    Vibration.vibrate(duration: 80);
    setState(() {
      _lastTicket = ticket;
      _error = null;
      _barcodeStartCtrl.text = ticket.serialNumber;
      _scanning = false;
    });
  }

  Future<void> _sendToDesktop() async {
    if (_lastTicket == null) return;
    setState(() => _sending = true);
    await SessionService().sendTicketData(_lastTicket!, 'stock_purchase');
    if (mounted) {
      setState(() {
        _scanned.insert(0, _lastTicket!);
        _sending = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sent to desktop'), backgroundColor: Colors.green, duration: Duration(seconds: 2)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBg,
      body: Column(children: [
        // Scanner
        if (_scanning)
          SizedBox(
            height: 300,
            child: Stack(children: [
              MobileScanner(onDetect: _onDetect),
              const ScannerOverlay(label: 'Point at QR code on ticket'),
              Positioned(
                top: 8, right: 8,
                child: IconButton(
                  icon: const Icon(Icons.close, color: Colors.white),
                  onPressed: () => setState(() => _scanning = false),
                ),
              ),
            ]),
          )
        else
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: kDark,
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 4)],
            ),
            child: ElevatedButton.icon(
              onPressed: () => setState(() { _scanning = true; _lastTicket = null; _error = null; }),
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Scan Ticket QR Code'),
              style: ElevatedButton.styleFrom(
                backgroundColor: kPrimary,
                foregroundColor: Colors.white,
                minimumSize: const Size(double.infinity, 48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),

        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (_error != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFFECACA))),
                  child: Text(_error!, style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13)),
                ),

              if (_lastTicket != null) ...[
                ScanResultCard(ticket: _lastTicket!),
                const SizedBox(height: 16),
              ],

              // Form fields
              _buildCard('Purchase Details', [
                _field('Barcode Start', _barcodeStartCtrl, hint: 'Scanned from QR', keyboardType: TextInputType.number),
                _field('Barcode End',   _barcodeEndCtrl,   hint: 'Scan end barcode', keyboardType: TextInputType.number),
                Row(children: [
                  Expanded(child: _field('Quantity', _qtyCtrl, hint: 'Auto-calculated', keyboardType: TextInputType.number)),
                  const SizedBox(width: 12),
                  Expanded(child: _field('Unit Price (Rs.)', _priceCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true))),
                ]),
              ]),

              const SizedBox(height: 16),

              if (_lastTicket != null)
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _sending ? null : _sendToDesktop,
                    icon: _sending
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Icon(Icons.send),
                    label: Text(_sending ? 'Sending…' : 'Send to Desktop'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: kPrimary,
                      foregroundColor: Colors.white,
                      minimumSize: const Size(double.infinity, 50),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),

              if (_scanned.isNotEmpty) ...[
                const SizedBox(height: 24),
                const Text('Recent Scans', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                const SizedBox(height: 8),
                ..._scanned.take(5).map((t) => ScanResultCard(ticket: t, compact: true)),
              ],
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _buildCard(String title, List<Widget> children) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white, borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE8E8E8)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 4)],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: kDark)),
        const SizedBox(height: 12),
        ...children,
      ]),
    );
  }

  Widget _field(String label, TextEditingController ctrl, {String? hint, TextInputType? keyboardType}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: kGrey)),
        const SizedBox(height: 4),
        TextField(
          controller: ctrl,
          keyboardType: keyboardType,
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(color: kGrey.withOpacity(0.6), fontSize: 13),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: kPrimary, width: 1.5)),
            filled: true, fillColor: const Color(0xFFFAFAFA),
          ),
        ),
      ]),
    );
  }

  @override
  void dispose() {
    _barcodeStartCtrl.dispose();
    _barcodeEndCtrl.dispose();
    _qtyCtrl.dispose();
    _priceCtrl.dispose();
    super.dispose();
  }
}
