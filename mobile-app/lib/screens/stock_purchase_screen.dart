import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:vibration/vibration.dart';
import '../app.dart';
import '../models/ticket_data.dart';
import '../services/qr_parser.dart';
import '../services/session_service.dart';
import '../widgets/scanner_overlay.dart';
import '../widgets/scan_result_card.dart';

class StockPurchaseScreen extends StatefulWidget {
  const StockPurchaseScreen({super.key});
  @override
  State<StockPurchaseScreen> createState() => _StockPurchaseScreenState();
}

class _StockPurchaseScreenState extends State<StockPurchaseScreen>
    with SingleTickerProviderStateMixin {
  bool _scanning = false;
  TicketData? _ticket;
  bool _sending = false;
  bool _sent = false;
  String? _error;

  // Form controllers — populated immediately on QR scan
  final _gameCtrl     = TextEditingController();
  final _drawNoCtrl   = TextEditingController();
  final _drawDateCtrl = TextEditingController();
  final _startCtrl    = TextEditingController();
  final _endCtrl      = TextEditingController();
  final _qtyCtrl      = TextEditingController();
  final _priceCtrl    = TextEditingController(text: '32.50');

  final List<TicketData> _history = [];

  // Scanner guard
  bool _handled = false;

  @override
  void dispose() {
    for (final c in [_gameCtrl, _drawNoCtrl, _drawDateCtrl,
                     _startCtrl, _endCtrl, _qtyCtrl, _priceCtrl]) {
      c.dispose();
    }
    super.dispose();
  }

  // ── QR detected ─────────────────────────────────────────────────────────────
  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    final value = capture.barcodes.firstOrNull?.rawValue;
    if (value == null || value.isEmpty) return;

    final ticket = QRParser.parse(value);
    if (ticket == null) {
      setState(() { _error = 'Unrecognised ticket QR — try another angle'; });
      return;
    }

    _handled = true;
    Vibration.vibrate(duration: 60);
    HapticFeedback.mediumImpact();

    // ── Instant auto-fill ────────────────────────────────────────────────────
    setState(() {
      _ticket  = ticket;
      _error   = null;
      _sent    = false;
      _scanning = false;
      _gameCtrl.text     = ticket.gameName;
      _drawNoCtrl.text   = ticket.drawNumber;
      _drawDateCtrl.text = ticket.drawDate;
      _startCtrl.text    = ticket.serialNumber;
      _endCtrl.text      = '';      // user scans/enters end barcode separately
      _qtyCtrl.text      = '';
    });

    // Auto-send to desktop after successful parse
    _sendToDesktop(ticket);
  }

  Future<void> _sendToDesktop(TicketData ticket) async {
    setState(() => _sending = true);
    await SessionService().sendTicketData(ticket, 'stock_purchase');
    if (mounted) setState(() { _sending = false; _sent = true; });
  }

  void _openScanner() {
    setState(() { _scanning = true; _handled = false; _error = null; });
  }

  void _closeScanner() => setState(() { _scanning = false; _handled = false; });

  void _clearForm() => setState(() {
    _ticket = null; _sent = false; _error = null;
    for (final c in [_gameCtrl,_drawNoCtrl,_drawDateCtrl,
                     _startCtrl,_endCtrl,_qtyCtrl]) { c.clear(); }
    _priceCtrl.text = '32.50';
  });

  void _saveRecord() {
    if (_ticket == null) return;
    setState(() {
      _history.insert(0, _ticket!);
      _clearForm();
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Purchase saved'),
          backgroundColor: Colors.green, duration: Duration(seconds: 2)));
  }

  // ── Build ────────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBg,
      body: Column(children: [
        // ── Scanner view ──
        AnimatedContainer(
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeInOut,
          height: _scanning ? 280 : 0,
          child: _scanning ? _buildScanner() : const SizedBox.shrink(),
        ),

        // ── Body ──
        Expanded(
          child: CustomScrollView(slivers: [
            SliverToBoxAdapter(child: _buildScanButton()),
            if (_error != null)
              SliverToBoxAdapter(child: _buildError()),
            if (_ticket != null)
              SliverToBoxAdapter(child: _buildTicketCard()),
            SliverToBoxAdapter(child: _buildForm()),
            if (_ticket != null)
              SliverToBoxAdapter(child: _buildActions()),
            if (_history.isNotEmpty)
              SliverToBoxAdapter(child: _buildHistory()),
            const SliverToBoxAdapter(child: SizedBox(height: 32)),
          ]),
        ),
      ]),
    );
  }

  Widget _buildScanner() {
    return Stack(fit: StackFit.expand, children: [
      MobileScanner(
        onDetect: _onDetect,
        fit: BoxFit.cover,
      ),
      const ScannerOverlay(label: 'Point at ticket QR code'),
      Positioned(
        top: 8, right: 8,
        child: IconButton(
          onPressed: _closeScanner,
          icon: const Icon(Icons.close, color: Colors.white, size: 22),
          style: IconButton.styleFrom(
            backgroundColor: Colors.black45,
            shape: const CircleBorder(),
          ),
        ),
      ),
    ]);
  }

  Widget _buildScanButton() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: FilledButton.icon(
        onPressed: _scanning ? _closeScanner : _openScanner,
        style: FilledButton.styleFrom(
          backgroundColor: _scanning ? Colors.grey.shade600 : kPrimary,
          minimumSize: const Size(double.infinity, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        icon: Icon(_scanning ? Icons.close : Icons.qr_code_scanner, size: 20),
        label: Text(
          _scanning ? 'Cancel Scan' : 'Scan Ticket QR Code',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  Widget _buildError() => Padding(
    padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
    child: Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFFECACA)),
      ),
      child: Row(children: [
        const Icon(Icons.warning_amber_rounded,
            color: Color(0xFFDC2626), size: 18),
        const SizedBox(width: 8),
        Expanded(child: Text(_error!,
            style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13))),
        IconButton(
          icon: const Icon(Icons.close, size: 16, color: Color(0xFF9CA3AF)),
          onPressed: () => setState(() => _error = null),
          padding: EdgeInsets.zero, constraints: const BoxConstraints(),
        ),
      ]),
    ),
  );

  Widget _buildTicketCard() => Padding(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
    child: Stack(children: [
      ScanResultCard(ticket: _ticket!),
      if (_sent)
        Positioned(
          top: 8, right: 8,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: const Color(0xFFDCFCE7),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF86EFAC)),
            ),
            child: const Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.check_circle_outline,
                  color: Color(0xFF16A34A), size: 13),
              SizedBox(width: 4),
              Text('Sent to Desktop',
                  style: TextStyle(color: Color(0xFF16A34A),
                      fontSize: 11, fontWeight: FontWeight.w700)),
            ]),
          ),
        ),
      if (_sending)
        Positioned(
          top: 8, right: 8,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFFEFF6FF),
              borderRadius: BorderRadius.circular(20),
            ),
            child: const SizedBox(width: 12, height: 12,
              child: CircularProgressIndicator(
                  strokeWidth: 1.5, color: Color(0xFF2563EB))),
          ),
        ),
    ]),
  );

  Widget _buildForm() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE8E8E8)),
          boxShadow: const [BoxShadow(
              color: Color(0x08000000), blurRadius: 6, offset: Offset(0, 2))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Purchase Details',
              style: TextStyle(fontWeight: FontWeight.w800,
                  fontSize: 14, color: kDark)),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: _field('Game', _gameCtrl, hint: 'Auto-filled')),
            const SizedBox(width: 10),
            Expanded(child: _field('Draw No.', _drawNoCtrl, hint: 'Auto-filled')),
          ]),
          const SizedBox(height: 10),
          _field('Draw Date', _drawDateCtrl, hint: 'Auto-filled'),
          const SizedBox(height: 10),
          _field('Barcode Start', _startCtrl,
              hint: 'Scanned from QR', mono: true,
              filled: _ticket != null),
          const SizedBox(height: 10),
          _field('Barcode End', _endCtrl,
              hint: 'Scan end barcode', mono: true,
              keyboardType: TextInputType.number),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: _field('Quantity', _qtyCtrl,
                hint: 'Auto / enter', keyboardType: TextInputType.number)),
            const SizedBox(width: 10),
            Expanded(child: _field('Unit Price (Rs.)', _priceCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true))),
          ]),
        ]),
      ),
    );
  }

  Widget _field(String label, TextEditingController ctrl,
      {String? hint, bool mono = false, bool filled = false,
       TextInputType? keyboardType}) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label,
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
              color: kGrey)),
      const SizedBox(height: 4),
      TextField(
        controller: ctrl,
        keyboardType: keyboardType,
        style: TextStyle(
          fontSize: 13,
          fontFamily: mono ? 'monospace' : null,
          fontWeight: FontWeight.w600,
          color: filled ? kPrimary : kDark,
        ),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: TextStyle(color: kGrey.withOpacity(0.55), fontSize: 13),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          filled: true,
          fillColor: filled
              ? const Color(0xFFFEF2F2)
              : const Color(0xFFFAFAFA),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(9),
              borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(9),
              borderSide: BorderSide(
                  color: filled
                      ? const Color(0xFFFECACA)
                      : const Color(0xFFE5E7EB))),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(9),
              borderSide:
                  const BorderSide(color: kPrimary, width: 1.5)),
        ),
        onFocus: (_) {},
      ),
    ]);
  }

  Widget _buildActions() => Padding(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
    child: Row(children: [
      Expanded(
        child: OutlinedButton.icon(
          onPressed: _clearForm,
          icon: const Icon(Icons.refresh, size: 16),
          label: const Text('Clear'),
          style: OutlinedButton.styleFrom(
            foregroundColor: kGrey,
            side: const BorderSide(color: Color(0xFFE5E7EB)),
            padding: const EdgeInsets.symmetric(vertical: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
        ),
      ),
      const SizedBox(width: 10),
      Expanded(
        flex: 2,
        child: FilledButton.icon(
          onPressed: _saveRecord,
          icon: const Icon(Icons.save_alt, size: 16),
          label: const Text('Save Purchase'),
          style: FilledButton.styleFrom(
            backgroundColor: kPrimary,
            padding: const EdgeInsets.symmetric(vertical: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
        ),
      ),
    ]),
  );

  Widget _buildHistory() => Padding(
    padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        const Text('Recent Scans',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
        const Spacer(),
        Text('${_history.length}',
            style: const TextStyle(
                color: kPrimary, fontWeight: FontWeight.w800, fontSize: 13)),
      ]),
      const SizedBox(height: 8),
      ..._history.take(5).map(
              (t) => Padding(padding: const EdgeInsets.only(bottom: 6),
                  child: ScanResultCard(ticket: t, compact: true))),
    ]),
  );
}
