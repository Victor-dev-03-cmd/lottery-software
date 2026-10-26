import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../app.dart';
import '../services/session_service.dart';
import 'main_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _fadeAnim;
  late final Animation<double> _scaleAnim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );

    _fadeAnim = CurvedAnimation(parent: _ctrl, curve: Curves.easeOut);
    _scaleAnim = Tween<double>(begin: 0.82, end: 1.0).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic),
    );

    // Start animation then restore session and navigate
    _ctrl.forward();
    _init();
  }

  Future<void> _init() async {
    // Restore any saved pairing session in parallel with the animation
    await SessionService().loadAndConnect();
    // Wait for at least the animation to finish before transitioning
    await Future.delayed(const Duration(milliseconds: 1600));
    if (mounted) {
      Navigator.of(context).pushReplacement(
        PageRouteBuilder(
          pageBuilder: (_, a1, a2) => const MainScreen(),
          transitionsBuilder: (_, a1, a2, child) =>
              FadeTransition(opacity: a1, child: child),
          transitionDuration: const Duration(milliseconds: 300),
        ),
      );
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF0F7FF), // light blue-white
      body: Center(
        child: FadeTransition(
          opacity: _fadeAnim,
          child: ScaleTransition(
            scale: _scaleAnim,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // ── Brand symbol ──────────────────────────────────────────────
                CustomPaint(
                  size: const Size(88, 88),
                  painter: _BrandSymbolPainter(),
                ),
                const SizedBox(height: 28),

                // ── App name ──────────────────────────────────────────────────
                Text(
                  'Ajith Rohana',
                  style: GoogleFonts.inter(
                    fontSize: 26,
                    fontWeight: FontWeight.w700,
                    color: kText,
                    letterSpacing: -0.3,
                  ),
                ),
                Text(
                  'Enterprise',
                  style: GoogleFonts.inter(
                    fontSize: 16,
                    fontWeight: FontWeight.w400,
                    color: kTextSub,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'Lottery Distribution Manager',
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    fontWeight: FontWeight.w400,
                    color: kTextSub.withValues(alpha: 0.7),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Custom geometric brand symbol ─────────────────────────────────────────────
// Four squares arranged in a 2×2 grid, each in one of the four Google brand
// colors, with rounded corners. Inspired by Google's four-color philosophy.
// This is a bespoke design and does not imply affiliation with Google.
class _BrandSymbolPainter extends CustomPainter {
  static const _blue   = Color(0xFF4285F4);
  static const _red    = Color(0xFFEA4335);
  static const _yellow = Color(0xFFFBBC04);
  static const _green  = Color(0xFF34A853);

  @override
  void paint(Canvas canvas, Size size) {
    const gap = 6.0;
    const radius = Radius.circular(10);
    final half = (size.width - gap) / 2;

    final rects = [
      // top-left  → Blue
      (Rect.fromLTWH(0, 0, half, half), _blue),
      // top-right → Red
      (Rect.fromLTWH(half + gap, 0, half, half), _red),
      // bottom-left → Yellow
      (Rect.fromLTWH(0, half + gap, half, half), _yellow),
      // bottom-right → Green
      (Rect.fromLTWH(half + gap, half + gap, half, half), _green),
    ];

    for (final (rect, color) in rects) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, radius),
        Paint()..color = color,
      );
    }
  }

  @override
  bool shouldRepaint(_) => false;
}
