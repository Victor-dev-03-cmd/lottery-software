import 'package:flutter/material.dart';

/// Modern scanner viewfinder overlay.
/// Dark backdrop with a transparent rectangular window, sharp corner accents,
/// and a smooth animated scan-line.
class ScannerOverlay extends StatelessWidget {
  final String label;
  const ScannerOverlay({super.key, required this.label});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      final w = constraints.maxWidth;
      final h = constraints.maxHeight;
      final frameW = w * 0.78;
      final frameH = frameW * 0.58;
      final frameRect = Rect.fromCenter(
        center: Offset(w / 2, h * 0.44),
        width: frameW,
        height: frameH,
      );

      return Stack(children: [
        // Semi-transparent dark backdrop with transparent hole
        CustomPaint(
          size: Size(w, h),
          painter: _BackdropPainter(frameRect),
        ),
        // Animated corner accents
        Positioned.fromRect(
          rect: frameRect,
          child: _CornerAccents(size: Size(frameRect.width, frameRect.height)),
        ),
        // Animated scan line
        Positioned.fromRect(
          rect: frameRect,
          child: const _ScanLine(),
        ),
        // Label
        Positioned(
          top: frameRect.bottom + 16,
          left: 0,
          right: 0,
          child: Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.50),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.3,
                ),
              ),
            ),
          ),
        ),
      ]);
    });
  }
}

// ── Backdrop with even-odd hole ─────────────────────────────────────────────

class _BackdropPainter extends CustomPainter {
  final Rect frame;
  _BackdropPainter(this.frame);

  @override
  void paint(Canvas canvas, Size size) {
    // Dark semi-transparent overlay
    final path = Path()
      ..addRect(Offset.zero & size)
      ..addRRect(RRect.fromRectAndRadius(frame, const Radius.circular(8)))
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(path, Paint()..color = Colors.black.withValues(alpha: 0.65));

    // Soft white inner border around the viewfinder window
    canvas.drawRRect(
      RRect.fromRectAndRadius(frame, const Radius.circular(8)),
      Paint()
        ..color = Colors.white.withValues(alpha: 0.18)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.0,
    );
  }

  @override
  bool shouldRepaint(_BackdropPainter old) => old.frame != frame;
}

// ── Corner accents ──────────────────────────────────────────────────────────

class _CornerAccents extends StatelessWidget {
  final Size size;
  const _CornerAccents({required this.size});

  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: size, painter: _CornerPainter());
}

class _CornerPainter extends CustomPainter {
  static const _cornerLen  = 22.0;
  static const _strokeW    = 2.8;
  static const _radius     = 8.0;
  static const _color      = Color(0xFFCF291D); // app primary red

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = _color
      ..strokeWidth = _strokeW
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final w = size.width;
    final h = size.height;
    const r = Radius.circular(_radius);
    const L = _cornerLen;

    // Top-left
    canvas.drawPath(
      Path()
        ..moveTo(0, L)
        ..lineTo(0, _radius)
        ..arcToPoint(Offset(_radius, 0), radius: r, clockwise: true)
        ..lineTo(L, 0),
      p,
    );

    // Top-right
    canvas.drawPath(
      Path()
        ..moveTo(w - L, 0)
        ..lineTo(w - _radius, 0)
        ..arcToPoint(Offset(w, _radius), radius: r, clockwise: true)
        ..lineTo(w, L),
      p,
    );

    // Bottom-left
    canvas.drawPath(
      Path()
        ..moveTo(0, h - L)
        ..lineTo(0, h - _radius)
        ..arcToPoint(Offset(_radius, h), radius: r, clockwise: false)
        ..lineTo(L, h),
      p,
    );

    // Bottom-right
    canvas.drawPath(
      Path()
        ..moveTo(w - L, h)
        ..lineTo(w - _radius, h)
        ..arcToPoint(Offset(w, h - _radius), radius: r, clockwise: false)
        ..lineTo(w, h - L),
      p,
    );
  }

  @override
  bool shouldRepaint(_) => false;
}

// ── Animated scan line ──────────────────────────────────────────────────────

class _ScanLine extends StatefulWidget {
  const _ScanLine();
  @override
  State<_ScanLine> createState() => _ScanLineState();
}

class _ScanLineState extends State<_ScanLine>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat(reverse: true);
    _anim = CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut);
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _anim,
    builder: (_, __) => CustomPaint(painter: _ScanLinePainter(_anim.value)),
  );
}

class _ScanLinePainter extends CustomPainter {
  final double t;
  _ScanLinePainter(this.t);

  @override
  void paint(Canvas canvas, Size size) {
    final y = 4 + (size.height - 8) * t;
    // Thin red line with gradient fade at edges
    final paint = Paint()
      ..shader = LinearGradient(colors: [
        Colors.transparent,
        const Color(0xFFCF291D).withValues(alpha: 0.8),
        const Color(0xFFFF4444).withValues(alpha: 0.9),
        const Color(0xFFCF291D).withValues(alpha: 0.8),
        Colors.transparent,
      ]).createShader(Rect.fromLTWH(0, y - 1, size.width, 2));
    canvas.drawRect(Rect.fromLTWH(0, y - 1, size.width, 2), paint);
  }

  @override
  bool shouldRepaint(_ScanLinePainter old) => old.t != t;
}
