import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'scanner_overlay.dart';

/// Drop-in scanner widget used on every scan screen.
/// Wraps MobileScanner + ScannerOverlay + torch toggle + close button.
/// Handles controller lifecycle internally — callers just pass callbacks.
class ScannerView extends StatefulWidget {
  final String overlayLabel;
  final void Function(BarcodeCapture) onDetect;
  final VoidCallback onClose;
  final bool qrOnly;

  const ScannerView({
    super.key,
    required this.overlayLabel,
    required this.onDetect,
    required this.onClose,
    this.qrOnly = true,
  });

  @override
  State<ScannerView> createState() => _ScannerViewState();
}

class _ScannerViewState extends State<ScannerView> {
  late final MobileScannerController _ctrl;
  bool _torchOn = false;

  @override
  void initState() {
    super.initState();
    // formats is omitted when qrOnly=false so the controller uses its default
    // (all barcode formats). Passing BarcodeFormat.all here fails because it is
    // a BarcodeFormat bitmask constant, not a List<BarcodeFormat>.
    _ctrl = widget.qrOnly
        ? MobileScannerController(
            formats: [BarcodeFormat.qrCode],
            torchEnabled: false,
          )
        : MobileScannerController(
            torchEnabled: false,
          );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _toggleTorch() {
    _ctrl.toggleTorch();
    setState(() => _torchOn = !_torchOn);
  }

  void _handleClose() {
    if (_torchOn) {
      _ctrl.toggleTorch();
      setState(() => _torchOn = false);
    }
    widget.onClose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(fit: StackFit.expand, children: [
      MobileScanner(
        controller: _ctrl,
        onDetect: widget.onDetect,
        fit: BoxFit.cover,
      ),
      ScannerOverlay(label: widget.overlayLabel),

      // ── Torch (top-left) ───────────────────────────────────────────────────
      Positioned(
        top: 8, left: 8,
        child: _ScanButton(
          icon: _torchOn ? Icons.flashlight_off : Icons.flashlight_on,
          iconColor: _torchOn ? const Color(0xFFFCD34D) : Colors.white,
          bgColor: _torchOn ? Colors.amber.withValues(alpha: 0.30) : Colors.black45,
          onTap: _toggleTorch,
          tooltip: _torchOn ? 'Flashlight off' : 'Flashlight on',
        ),
      ),

      // ── Close (top-right) ─────────────────────────────────────────────────
      Positioned(
        top: 8, right: 8,
        child: _ScanButton(
          icon: Icons.close,
          iconColor: Colors.white,
          bgColor: Colors.black45,
          onTap: _handleClose,
        ),
      ),
    ]);
  }
}

class _ScanButton extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final Color bgColor;
  final VoidCallback onTap;
  final String? tooltip;

  const _ScanButton({
    required this.icon,
    required this.iconColor,
    required this.bgColor,
    required this.onTap,
    this.tooltip,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip ?? '',
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: bgColor,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.25),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Icon(icon, color: iconColor, size: 20),
        ),
      ),
    );
  }
}
