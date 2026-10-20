import 'package:flutter/material.dart';

class ScannerOverlay extends StatelessWidget {
  final String label;
  const ScannerOverlay({super.key, required this.label});

  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      // Dark overlay with clear centre window
      ColorFiltered(
        colorFilter: const ColorFilter.mode(Colors.black54, BlendMode.srcOut),
        child: Stack(children: [
          Container(decoration: const BoxDecoration(color: Colors.black, backgroundBlendMode: BlendMode.dstOut)),
          Center(child: Container(
            width: 260, height: 160,
            decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(8)),
          )),
        ]),
      ),
      // Corner brackets
      Center(child: SizedBox(width: 260, height: 160,
        child: Stack(children: [
          Positioned(top: 0,    left: 0,    child: _corner(topLeft: true)),
          Positioned(top: 0,    right: 0,   child: _corner(topRight: true)),
          Positioned(bottom: 0, left: 0,    child: _corner(bottomLeft: true)),
          Positioned(bottom: 0, right: 0,   child: _corner(bottomRight: true)),
        ]),
      )),
      // Label
      Positioned(
        bottom: 20, left: 0, right: 0,
        child: Text(label, textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600,
            shadows: [Shadow(color: Colors.black54, blurRadius: 4)])),
      ),
    ]);
  }

  Widget _corner({bool topLeft = false, bool topRight = false, bool bottomLeft = false, bool bottomRight = false}) {
    return SizedBox(width: 24, height: 24,
      child: CustomPaint(painter: _CornerPainter(
        topLeft: topLeft, topRight: topRight, bottomLeft: bottomLeft, bottomRight: bottomRight)));
  }
}

class _CornerPainter extends CustomPainter {
  final bool topLeft, topRight, bottomLeft, bottomRight;
  _CornerPainter({this.topLeft=false, this.topRight=false, this.bottomLeft=false, this.bottomRight=false});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white..strokeWidth = 3..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
    final p = Path();
    if (topLeft)     { p.moveTo(0, 14); p.lineTo(0, 0); p.lineTo(14, 0); }
    if (topRight)    { p.moveTo(size.width-14, 0); p.lineTo(size.width, 0); p.lineTo(size.width, 14); }
    if (bottomLeft)  { p.moveTo(0, size.height-14); p.lineTo(0, size.height); p.lineTo(14, size.height); }
    if (bottomRight) { p.moveTo(size.width-14, size.height); p.lineTo(size.width, size.height); p.lineTo(size.width, size.height-14); }
    canvas.drawPath(p, paint);
  }
  @override
  bool shouldRepaint(_) => false;
}
