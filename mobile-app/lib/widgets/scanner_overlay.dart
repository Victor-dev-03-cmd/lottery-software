import 'package:flutter/material.dart';

/// Proper scanner viewfinder overlay — no ColorFiltered hack.
/// Uses a CustomPainter to draw a semi-transparent dark mask with
/// a transparent rectangular hole in the centre.
class ScannerOverlay extends StatelessWidget {
  final String label;
  const ScannerOverlay({super.key, required this.label});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      final w = constraints.maxWidth;
      final h = constraints.maxHeight;
      // Frame: 80% wide, proportional height
      final frameW = w * 0.80;
      final frameH = frameW * 0.55;
      final frameRect = Rect.fromCenter(
        center: Offset(w / 2, h * 0.42),
        width: frameW,
        height: frameH,
      );

      return Stack(children: [
        // Dark mask with transparent hole
        CustomPaint(
          size: Size(w, h),
          painter: _OverlayPainter(frameRect),
        ),
        // Corner brackets
        Positioned.fromRect(
          rect: frameRect,
          child: _CornerBrackets(frameRect: frameRect),
        ),
        // Scan line animation
        Positioned.fromRect(
          rect: frameRect,
          child: const _ScanLine(),
        ),
        // Label below frame
        Positioned(
          top: frameRect.bottom + 14,
          left: 0,
          right: 0,
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w500,
              shadows: [Shadow(color: Colors.black54, blurRadius: 4)],
            ),
          ),
        ),
      ]);
    });
  }
}

class _OverlayPainter extends CustomPainter {
  final Rect frame;
  _OverlayPainter(this.frame);

  @override
  void paint(Canvas canvas, Size size) {
    final full = Offset.zero & size;
    // Dark overlay
    final paint = Paint()..color = Colors.black.withOpacity(0.60);
    // Clip the hole out using even-odd fill
    final path = Path()
      ..addRect(full)
      ..addRRect(RRect.fromRectAndRadius(frame, const Radius.circular(10)))
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(path, paint);

    // Subtle white border around the frame
    canvas.drawRRect(
      RRect.fromRectAndRadius(frame, const Radius.circular(10)),
      Paint()
        ..color = Colors.white.withOpacity(0.25)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(_OverlayPainter old) => old.frame != frame;
}

class _CornerBrackets extends StatelessWidget {
  final Rect frameRect;
  const _CornerBrackets({required this.frameRect});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(frameRect.width, frameRect.height),
      painter: _BracketPainter(),
    );
  }
}

class _BracketPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = const Color(0xFFCF291D)
      ..strokeWidth = 3.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    const len = 24.0;
    final r = const Radius.circular(3);

    // Top-left
    canvas.drawPath(Path()
      ..moveTo(0, len)
      ..arcToPoint(Offset(len, 0), radius: r, clockwise: false), p);
    // Top-right
    canvas.drawPath(Path()
      ..moveTo(size.width - len, 0)
      ..arcToPoint(Offset(size.width, len), radius: r), p);
    // Bottom-left
    canvas.drawPath(Path()
      ..moveTo(0, size.height - len)
      ..arcToPoint(Offset(len, size.height), radius: r, clockwise: true), p);
    // Bottom-right
    canvas.drawPath(Path()
      ..moveTo(size.width - len, size.height)
      ..arcToPoint(Offset(size.width, size.height - len), radius: r,
          clockwise: false), p);
  }

  @override
  bool shouldRepaint(_) => false;
}

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
        vsync: this, duration: const Duration(milliseconds: 1800))
      ..repeat(reverse: true);
    _anim = Tween<double>(begin: 0, end: 1).animate(
        CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (_, __) => CustomPaint(
        painter: _ScanLinePainter(_anim.value),
      ),
    );
  }
}

class _ScanLinePainter extends CustomPainter {
  final double progress;
  _ScanLinePainter(this.progress);

  @override
  void paint(Canvas canvas, Size size) {
    final y = size.height * progress;
    final paint = Paint()
      ..shader = LinearGradient(
        colors: [
          Colors.transparent,
          const Color(0xFFCF291D).withOpacity(0.7),
          Colors.transparent,
        ],
      ).createShader(Rect.fromLTWH(0, y - 1, size.width, 2));
    canvas.drawRect(Rect.fromLTWH(0, y - 1, size.width, 2), paint);
  }

  @override
  bool shouldRepaint(_ScanLinePainter old) => old.progress != progress;
}
