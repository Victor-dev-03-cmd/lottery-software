import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_scanner/mobile_scanner.dart' show BarcodeCapture;
import 'package:vibration/vibration.dart';
import '../models/ticket_data.dart';
import '../services/qr_parser.dart';
import '../services/session_service.dart';
import '../widgets/scanner_view.dart';

// ── Screen-local design tokens ────────────────────────────────────────────────
const _cBrand       = Color(0xFFD92D20);
const _cBrandLight  = Color(0xFFFEF3F2);
const _cBrandBorder = Color(0xFFFECACA);
const _cBg          = Color(0xFFF7F8FA);
const _cCard        = Colors.white;
const _cText        = Color(0xFF101828);
const _cSub         = Color(0xFF667085);
const _cMuted       = Color(0xFF98A2B3);
const _cBorder      = Color(0xFFEAECF0);
const _cSuccess     = Color(0xFF12B76A);
const _cSuccessText = Color(0xFF027A48);
const _cSuccessBg   = Color(0xFFECFDF3);
const _cSuccessBdr  = Color(0xFF6CE9A6);
const _cWarning     = Color(0xFFF79009);

// ── Text styles ───────────────────────────────────────────────────────────────
TextStyle _ts(double size, FontWeight w, {Color c = _cText, double ls = 0}) =>
    GoogleFonts.inter(fontSize: size, fontWeight: w, color: c, letterSpacing: ls);

// ── Sync state ────────────────────────────────────────────────────────────────
enum _SyncState { idle, syncing, sent, failed }

class StockPurchaseScreen extends StatefulWidget {
  const StockPurchaseScreen({super.key});
  @override
  State<StockPurchaseScreen> createState() => _StockPurchaseScreenState();
}

class _StockPurchaseScreenState extends State<StockPurchaseScreen> {
  // ── State (all existing, preserved) ─────────────────────────────────────────
  bool _scanning    = false;
  bool _scanningEnd = false;          // NEW: dedicated end-barcode scan mode
  TicketData? _ticket;
  _SyncState _sync  = _SyncState.idle;
  String? _error;

  // ── Controllers (all existing, preserved) ────────────────────────────────────
  final _gameCtrl     = TextEditingController();
  final _drawNoCtrl   = TextEditingController();
  final _drawDateCtrl = TextEditingController();
  final _startCtrl    = TextEditingController();
  final _endCtrl      = TextEditingController();
  final _qtyCtrl      = TextEditingController();
  final _priceCtrl    = TextEditingController(text: '32.50');

  final List<TicketData> _history = [];
  bool _handled = false;

  @override
  void dispose() {
    for (final c in [_gameCtrl, _drawNoCtrl, _drawDateCtrl,
                     _startCtrl, _endCtrl, _qtyCtrl, _priceCtrl]) {
      c.dispose();
    }
    super.dispose();
  }

  // ── QR detected — start barcode (EXISTING logic, unchanged) ─────────────────
  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    final value = capture.barcodes.firstOrNull?.rawValue;
    if (value == null || value.isEmpty) return;

    final ticket = QRParser.parse(value);
    if (ticket == null) {
      setState(() => _error = 'Unrecognised ticket QR — try another angle');
      return;
    }

    _handled = true;
    Vibration.vibrate(duration: 60);
    HapticFeedback.mediumImpact();

    setState(() {
      _ticket  = ticket;
      _error   = null;
      _sync    = _SyncState.idle;
      _scanning = false;
      _gameCtrl.text     = ticket.gameName;
      _drawNoCtrl.text   = ticket.drawNumber;
      _drawDateCtrl.text = ticket.drawDate;
      _startCtrl.text    = ticket.barcodeStart;
      _endCtrl.text      = '';
      _qtyCtrl.text      = '';
    });

    _sendToDesktop(ticket);
  }

  // ── QR detected — end barcode (NEW) ──────────────────────────────────────────
  void _onDetectEnd(BarcodeCapture capture) {
    final value = capture.barcodes.firstOrNull?.rawValue;
    if (value == null || value.isEmpty) return;
    // Accept any numeric sequence as a barcode
    final cleaned = value.replaceAll(RegExp(r'[^0-9]'), '');
    if (cleaned.isEmpty) return;

    Vibration.vibrate(duration: 40);
    HapticFeedback.lightImpact();
    setState(() {
      _endCtrl.text = cleaned;
      _scanningEnd  = false;
    });
    _autoCalcQty();

    // Send the end barcode to the desktop so it can update the existing row.
    // Uses sendTicketData with the named barcodeEnd parameter so the desktop
    // can distinguish this update from a new-row scan.
    if (_ticket != null) {
      _sendToDesktop(_ticket!, barcodeEnd: cleaned);
    }
  }

  // ── Optional quantity auto-calc ───────────────────────────────────────────────
  // Only fills qty if currently empty. Preserves any manually entered value.
  void _autoCalcQty() {
    if (_qtyCtrl.text.isNotEmpty) return;
    final start = int.tryParse(_startCtrl.text.trim());
    final end   = int.tryParse(_endCtrl.text.trim());
    if (start == null || end == null || end <= start) return;
    _qtyCtrl.text = (end - start).toString();
  }

  // ── Send to desktop ────────────────────────────────────────────────────────────
  // barcodeEnd is empty for the initial QR scan; non-empty when the end barcode
  // has been scanned — the desktop uses this to update the existing row rather
  // than creating a new one.
  Future<void> _sendToDesktop(TicketData ticket, {String barcodeEnd = ''}) async {
    setState(() => _sync = _SyncState.syncing);
    try {
      await SessionService().sendTicketData(
          ticket, 'stock_purchase', barcodeEnd: barcodeEnd);
      if (mounted) setState(() => _sync = _SyncState.sent);
    } catch (_) {
      if (mounted) setState(() => _sync = _SyncState.failed);
    }
  }

  // ── Retry sync ────────────────────────────────────────────────────────────────
  void _retrySync() {
    if (_ticket == null) return;
    // Retry sends the current state of both barcodes
    _sendToDesktop(_ticket!, barcodeEnd: _endCtrl.text.trim());
  }

  void _openScanner() =>
      setState(() { _scanning = true; _scanningEnd = false; _handled = false; _error = null; });

  void _openEndScanner() =>
      setState(() { _scanningEnd = true; _scanning = false; _handled = false; _error = null; });

  void _closeScanner() =>
      setState(() { _scanning = false; _scanningEnd = false; _handled = false; });

  void _clearForm() => setState(() {
    _ticket = null;
    _sync   = _SyncState.idle;
    _error  = null;
    for (final c in [_gameCtrl, _drawNoCtrl, _drawDateCtrl,
                     _startCtrl, _endCtrl, _qtyCtrl]) { c.clear(); }
    _priceCtrl.text = '32.50';
  });

  void _saveRecord() {
    if (_ticket == null) return;
    setState(() {
      _history.insert(0, _ticket!);
      _clearForm();
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Purchase saved',
            style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
        backgroundColor: _cSuccess,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  bool get _canSave =>
      _ticket != null && _qtyCtrl.text.isNotEmpty && _priceCtrl.text.isNotEmpty;

  double get _totalAmount {
    final qty   = int.tryParse(_qtyCtrl.text.trim()) ?? 0;
    final price = double.tryParse(_priceCtrl.text.trim()) ?? 0.0;
    return qty * price;
  }

  // ── BUILD ─────────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final isAnyScannerOpen = _scanning || _scanningEnd;
    return Scaffold(
      backgroundColor: _cBg,
      body: SafeArea(
        child: Column(children: [
          // ── Inline scanner (animates open/closed) ─────────────────────────────
          AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeInOut,
            height: isAnyScannerOpen ? 300 : 0,
            child: isAnyScannerOpen
                ? ScannerView(
                    // ValueKey forces a full dispose+recreate when switching
                    // between start-QR mode and end-barcode mode. Without this,
                    // Flutter reuses the existing ScannerView state (same widget
                    // type), keeping the old controller alive — so the torch
                    // state and format filter from the previous scan survive.
                    key: ValueKey(_scanningEnd),
                    overlayLabel: _scanningEnd
                        ? 'Scan the LAST ticket barcode'
                        : 'Scan ticket QR code',
                    onDetect: _scanningEnd ? _onDetectEnd : _onDetect,
                    onClose: _closeScanner,
                    qrOnly: !_scanningEnd,
                  )
                : const SizedBox.shrink(),
          ),

          // ── Scrollable content ────────────────────────────────────────────────
          Expanded(
            child: CustomScrollView(
              physics: const BouncingScrollPhysics(),
              slivers: [
                // ── Header ──────────────────────────────────────────────────────
                SliverToBoxAdapter(child: _buildHeader()),

                // ── Scan button ──────────────────────────────────────────────────
                SliverToBoxAdapter(child: _buildScanButton()),

                // ── Error banner ─────────────────────────────────────────────────
                if (_error != null)
                  SliverToBoxAdapter(child: _buildError()),

                // ── Ticket info card ─────────────────────────────────────────────
                if (_ticket != null)
                  SliverToBoxAdapter(child: _buildTicketCard()),

                // ── Purchase details ─────────────────────────────────────────────
                SliverToBoxAdapter(child: _buildPurchasePanel()),

                // ── Save action ──────────────────────────────────────────────────
                if (_ticket != null)
                  SliverToBoxAdapter(child: _buildSaveBar()),

                // ── Recent history ───────────────────────────────────────────────
                if (_history.isNotEmpty)
                  SliverToBoxAdapter(child: _buildHistory()),

                const SliverToBoxAdapter(child: SizedBox(height: 32)),
              ],
            ),
          ),
        ]),
      ),
    );
  }

  // ── Header ────────────────────────────────────────────────────────────────────
  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 4),
      child: Row(children: [
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Purchases', style: _ts(22, FontWeight.w700)),
          const SizedBox(height: 2),
          Text('Scan tickets and manage stock',
              style: _ts(12, FontWeight.w400, c: _cSub)),
        ]),
        const Spacer(),
        _buildConnectionBadge(),
      ]),
    );
  }

  Widget _buildConnectionBadge() {
    final status = SessionService().status;
    final (color, label, icon) = switch (status) {
      RelayStatus.connected    => (_cSuccess, 'Live', Icons.wifi_rounded),
      RelayStatus.connecting   => (_cWarning, 'Linking', Icons.sync_rounded),
      RelayStatus.disconnected => (_cMuted,   'Offline', Icons.wifi_off_rounded),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.30)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 5),
        Text(label, style: _ts(11, FontWeight.w600, c: color)),
      ]),
    );
  }

  // ── Scan button ───────────────────────────────────────────────────────────────
  Widget _buildScanButton() {
    final isActive = _scanning;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      child: FilledButton(
        onPressed: isActive ? _closeScanner : _openScanner,
        style: FilledButton.styleFrom(
          backgroundColor: isActive ? const Color(0xFF374151) : _cBrand,
          foregroundColor: Colors.white,
          minimumSize: const Size(double.infinity, 54),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          elevation: isActive ? 0 : 2,
          shadowColor: _cBrand.withValues(alpha: 0.30),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(isActive ? Icons.close_rounded : Icons.qr_code_scanner_rounded,
              size: 20),
          const SizedBox(width: 10),
          Text(
            isActive ? 'Cancel Scan' : 'Scan Ticket QR Code',
            style: _ts(15, FontWeight.w600, c: Colors.white),
          ),
        ]),
      ),
    );
  }

  // ── Error banner ──────────────────────────────────────────────────────────────
  Widget _buildError() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: _cBrandLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _cBrandBorder),
        ),
        child: Row(children: [
          const Icon(Icons.warning_amber_rounded, color: _cBrand, size: 18),
          const SizedBox(width: 10),
          Expanded(child: Text(_error!, style: _ts(13, FontWeight.w500, c: _cBrand))),
          GestureDetector(
            onTap: () => setState(() => _error = null),
            child: const Icon(Icons.close_rounded, size: 16, color: _cMuted),
          ),
        ]),
      ),
    );
  }

  // ── Ticket info card ──────────────────────────────────────────────────────────
  Widget _buildTicketCard() {
    final t = _ticket!;
    final isNlb = t.board == 'NLB';
    final boardColor = isNlb ? const Color(0xFF1D4ED8) : const Color(0xFFC2410C);
    final boardBg    = isNlb ? const Color(0xFFEFF6FF) : const Color(0xFFFFF7ED);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
      child: Container(
        decoration: BoxDecoration(
          color: _cCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _cBorder),
          boxShadow: [BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // ── Card header: board badge + game name + sync ──────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: Row(children: [
              // Board badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: boardBg,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: boardColor.withValues(alpha: 0.25)),
                ),
                child: Text(t.board,
                    style: _ts(11, FontWeight.w700, c: boardColor)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(t.gameName,
                    style: _ts(15, FontWeight.w700),
                    overflow: TextOverflow.ellipsis),
              ),
              const SizedBox(width: 8),
              _buildSyncBadge(),
            ]),
          ),

          // ── Draw info row ────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Row(children: [
              _infoChip(Icons.confirmation_number_outlined, 'Draw', t.drawNumber),
              const SizedBox(width: 12),
              _infoChip(Icons.calendar_today_outlined, 'Date', t.drawDate),
            ]),
          ),

          // ── Barcode section ──────────────────────────────────────────────────
          Container(
            margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: boardColor.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: boardColor.withValues(alpha: 0.15)),
            ),
            child: Row(children: [
              Icon(Icons.qr_code_2_rounded, color: boardColor, size: 22),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Ticket Barcode',
                      style: _ts(10, FontWeight.w600, c: _cSub)),
                  const SizedBox(height: 2),
                  Text(t.barcodeStart,
                      style: GoogleFonts.inter(
                        fontSize: 15, fontWeight: FontWeight.w700,
                        color: boardColor, letterSpacing: 0.5,
                        fontFeatures: [const FontFeature.tabularFigures()],
                      ),
                      overflow: TextOverflow.ellipsis),
                ],
              )),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _infoChip(IconData icon, String label, String value) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: const Color(0xFFF9FAFB),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: _cBorder),
        ),
        child: Row(children: [
          Icon(icon, size: 13, color: _cMuted),
          const SizedBox(width: 6),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: _ts(10, FontWeight.w500, c: _cMuted)),
              Text(value,
                  style: GoogleFonts.inter(
                    fontSize: 13, fontWeight: FontWeight.w600, color: _cText,
                    fontFeatures: [const FontFeature.tabularFigures()],
                  ),
                  overflow: TextOverflow.ellipsis),
            ],
          )),
        ]),
      ),
    );
  }

  Widget _buildSyncBadge() {
    return switch (_sync) {
      _SyncState.syncing => Container(
        padding: const EdgeInsets.all(5),
        decoration: BoxDecoration(
          color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(20)),
        child: const SizedBox(width: 12, height: 12,
          child: CircularProgressIndicator(strokeWidth: 1.8, color: Color(0xFF2563EB))),
      ),
      _SyncState.sent => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: _cSuccessBg, borderRadius: BorderRadius.circular(20),
          border: Border.all(color: _cSuccessBdr)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.check_circle_rounded, color: _cSuccessText, size: 13),
          const SizedBox(width: 4),
          Text('Sent', style: _ts(11, FontWeight.w600, c: _cSuccessText)),
        ]),
      ),
      _SyncState.failed => GestureDetector(
        onTap: _retrySync,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: _cBrandLight, borderRadius: BorderRadius.circular(20),
            border: Border.all(color: _cBrandBorder)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.refresh_rounded, color: _cBrand, size: 13),
            const SizedBox(width: 4),
            Text('Retry', style: _ts(11, FontWeight.w600, c: _cBrand)),
          ]),
        ),
      ),
      _SyncState.idle => const SizedBox.shrink(),
    };
  }

  // ── Purchase details panel ────────────────────────────────────────────────────
  Widget _buildPurchasePanel() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
      child: Container(
        decoration: BoxDecoration(
          color: _cCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _cBorder),
          boxShadow: [BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Panel header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
            child: Row(children: [
              const Icon(Icons.receipt_long_rounded, size: 16, color: _cMuted),
              const SizedBox(width: 8),
              Text('Purchase Details', style: _ts(14, FontWeight.w700)),
              const Spacer(),
              if (_ticket != null)
                GestureDetector(
                  onTap: _clearForm,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF9FAFB),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: _cBorder),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.close_rounded, size: 12, color: _cSub),
                      const SizedBox(width: 3),
                      Text('Clear', style: _ts(11, FontWeight.w500, c: _cSub)),
                    ]),
                  ),
                ),
            ]),
          ),

          // ── Row 1: Game + Draw No ────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(flex: 3,
                child: _formField('Game', _gameCtrl,
                    hint: 'Auto-filled from scan')),
              const SizedBox(width: 10),
              Expanded(flex: 2,
                child: _formField('Draw No.', _drawNoCtrl,
                    hint: 'Auto-filled', tabular: true)),
            ]),
          ),

          // ── Row 2: Draw Date (full width) ────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
            child: _formField('Draw Date', _drawDateCtrl, hint: 'Auto-filled'),
          ),

          // ── Divider ──────────────────────────────────────────────────────────
          const Divider(height: 1, color: _cBorder, thickness: 1),
          const SizedBox(height: 14),

          // ── Row 3: Barcode Start ─────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: _barcodeField(
              label: '▶ First Ticket Barcode',
              controller: _startCtrl,
              hint: 'Scanned from QR',
              filled: _ticket != null,
              color: const Color(0xFF2563EB),
              fillColor: const Color(0xFFEFF6FF),
            ),
          ),

          // ── Row 4: Barcode End + Scan End button ─────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('▷ Last Ticket Barcode',
                  style: _ts(12, FontWeight.w600, c: _cSub)),
              const SizedBox(height: 6),
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: TextField(
                    controller: _endCtrl,
                    keyboardType: TextInputType.number,
                    style: GoogleFonts.inter(
                      fontSize: 14, fontWeight: FontWeight.w600,
                      color: const Color(0xFF6D28D9), letterSpacing: 0.4,
                      fontFeatures: [const FontFeature.tabularFigures()],
                    ),
                    decoration: InputDecoration(
                      hintText: 'Scan or enter last ticket',
                      hintStyle: _ts(12, FontWeight.w400, c: _cMuted),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 12),
                      filled: true,
                      fillColor: const Color(0xFFF5F3FF),
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: const BorderSide(color: Color(0xFF7C3AED))),
                      enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: const BorderSide(
                              color: Color(0xFF7C3AED), width: 1.5)),
                      focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: const BorderSide(
                              color: Color(0xFF7C3AED), width: 2)),
                    ),
                    onChanged: (_) => _autoCalcQty(),
                  ),
                ),
                const SizedBox(width: 8),
                // ── Scan End Barcode button ──────────────────────────────────
                GestureDetector(
                  onTap: _scanningEnd ? _closeScanner : _openEndScanner,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 12),
                    decoration: BoxDecoration(
                      color: _scanningEnd
                          ? const Color(0xFF374151)
                          : const Color(0xFF7C3AED),
                      borderRadius: BorderRadius.circular(10),
                      boxShadow: [BoxShadow(
                          color: const Color(0xFF7C3AED).withValues(alpha: 0.20),
                          blurRadius: 8, offset: const Offset(0, 3))],
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(
                        _scanningEnd
                            ? Icons.close_rounded
                            : Icons.barcode_reader,
                        color: Colors.white, size: 18,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        _scanningEnd ? 'Cancel' : 'Scan',
                        style: _ts(13, FontWeight.w600, c: Colors.white),
                      ),
                    ]),
                  ),
                ),
              ]),
            ]),
          ),

          // ── Divider ──────────────────────────────────────────────────────────
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Divider(height: 1, color: _cBorder, thickness: 1),
          ),
          const SizedBox(height: 14),

          // ── Row 5: Quantity + Unit Price ─────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: _formField('Quantity', _qtyCtrl,
                    hint: 'Auto / enter',
                    keyboardType: TextInputType.number,
                    tabular: true,
                    onChanged: (_) => setState(() {})),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _formField('Unit Price (Rs.)', _priceCtrl,
                    keyboardType: const TextInputType.numberWithOptions(
                        decimal: true),
                    tabular: true,
                    onChanged: (_) => setState(() {})),
              ),
            ]),
          ),

          // ── Total summary ─────────────────────────────────────────────────────
          if (_totalAmount > 0)
            Container(
              margin: const EdgeInsets.fromLTRB(12, 0, 12, 14),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFF0FDF4),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFF86EFAC)),
              ),
              child: Row(children: [
                const Icon(Icons.calculate_outlined,
                    color: _cSuccessText, size: 18),
                const SizedBox(width: 8),
                Text('Total Purchase', style: _ts(13, FontWeight.w500, c: _cSub)),
                const Spacer(),
                Text(
                  'Rs. ${_totalAmount.toStringAsFixed(2)}',
                  style: GoogleFonts.inter(
                    fontSize: 16, fontWeight: FontWeight.w700,
                    color: _cSuccessText,
                    fontFeatures: [const FontFeature.tabularFigures()],
                  ),
                ),
              ]),
            ),
        ]),
      ),
    );
  }

  Widget _formField(
    String label,
    TextEditingController ctrl, {
    String? hint,
    TextInputType? keyboardType,
    bool tabular = false,
    void Function(String)? onChanged,
  }) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: _ts(12, FontWeight.w600, c: _cSub)),
      const SizedBox(height: 5),
      TextField(
        controller: ctrl,
        keyboardType: keyboardType,
        onChanged: onChanged,
        style: GoogleFonts.inter(
          fontSize: 14, fontWeight: FontWeight.w600, color: _cText,
          fontFeatures: tabular ? [const FontFeature.tabularFigures()] : null,
        ),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: _ts(12, FontWeight.w400, c: _cMuted),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          filled: true,
          fillColor: const Color(0xFFF9FAFB),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: _cBorder)),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: _cBorder)),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: _cBrand, width: 1.5)),
        ),
      ),
    ]);
  }

  Widget _barcodeField({
    required String label,
    required TextEditingController controller,
    required String hint,
    required bool filled,
    required Color color,
    required Color fillColor,
  }) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: _ts(12, FontWeight.w600, c: _cSub)),
      const SizedBox(height: 5),
      TextField(
        controller: controller,
        keyboardType: TextInputType.number,
        style: GoogleFonts.inter(
          fontSize: 14, fontWeight: FontWeight.w700,
          color: filled ? color : _cText,
          letterSpacing: 0.4,
          fontFeatures: [const FontFeature.tabularFigures()],
        ),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: _ts(12, FontWeight.w400, c: _cMuted),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          filled: true,
          fillColor: filled ? fillColor : const Color(0xFFF9FAFB),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: filled ? color : _cBorder)),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(
                  color: filled ? color : _cBorder,
                  width: filled ? 1.5 : 1)),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: color, width: 2)),
        ),
      ),
    ]);
  }

  // ── Save action bar ────────────────────────────────────────────────────────────
  Widget _buildSaveBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: FilledButton(
        onPressed: _canSave ? _saveRecord : null,
        style: FilledButton.styleFrom(
          backgroundColor: _cBrand,
          disabledBackgroundColor: _cBrand.withValues(alpha: 0.40),
          foregroundColor: Colors.white,
          minimumSize: const Size(double.infinity, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          elevation: _canSave ? 2 : 0,
          shadowColor: _cBrand.withValues(alpha: 0.30),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Icon(Icons.save_alt_rounded, size: 18),
          const SizedBox(width: 8),
          Text('Save Purchase', style: _ts(15, FontWeight.w600, c: Colors.white)),
        ]),
      ),
    );
  }

  // ── Recent scans history ──────────────────────────────────────────────────────
  Widget _buildHistory() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text('Recent Scans', style: _ts(14, FontWeight.w700)),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: _cBrandLight, borderRadius: BorderRadius.circular(20)),
            child: Text('${_history.length}',
                style: _ts(12, FontWeight.w700, c: _cBrand)),
          ),
        ]),
        const SizedBox(height: 10),
        ..._history.take(5).map((t) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: _buildCompactHistoryItem(t),
        )),
      ]),
    );
  }

  Widget _buildCompactHistoryItem(TicketData t) {
    final isNlb     = t.board == 'NLB';
    final boardColor = isNlb ? const Color(0xFF1D4ED8) : const Color(0xFFC2410C);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: _cCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _cBorder),
      ),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: boardColor.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(t.board, style: _ts(10, FontWeight.w700, c: boardColor)),
        ),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(t.gameName, style: _ts(13, FontWeight.w600), overflow: TextOverflow.ellipsis),
          Text('Draw ${t.drawNumber} · ${t.drawDate}',
              style: _ts(11, FontWeight.w400, c: _cSub)),
        ])),
        const SizedBox(width: 8),
        Text(
          t.barcodeStart.length > 10
              ? '…${t.barcodeStart.substring(t.barcodeStart.length - 8)}'
              : t.barcodeStart,
          style: GoogleFonts.inter(
            fontSize: 11, fontWeight: FontWeight.w600, color: boardColor,
            fontFeatures: [const FontFeature.tabularFigures()],
          ),
        ),
      ]),
    );
  }
}
