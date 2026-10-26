import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'screens/splash_screen.dart';

// ── Brand color palette — Google-inspired, Material 3 ─────────────────────────
const kPrimary   = Color(0xFF4285F4); // Google Blue  (primary interactive)
const kGreen     = Color(0xFF34A853); // Google Green (success / send)
const kYellow    = Color(0xFFFBBC04); // Google Yellow (highlights / warning)
const kRed       = Color(0xFFEA4335); // Google Red   (errors / destructive)

const kBgMain    = Color(0xFFF8FAFD); // Main scaffold background
const kCardBg    = Colors.white;
const kText      = Color(0xFF202124); // Primary text
const kTextSub   = Color(0xFF5F6368); // Secondary text
const kBorder    = Color(0xFFDADCE0); // Borders & dividers
const kBlueLight = Color(0xFFE8F0FE); // Blue tint — selected states
const kGreenBg   = Color(0xFFE6F4EA); // Green tint — success backgrounds

// ── Legacy aliases (used by screens not yet migrated to local tokens) ─────────
// ignore: constant_identifier_names
const kDark = Color(0xFF202124); // maps to kText
// ignore: constant_identifier_names
const kGrey = Color(0xFF5F6368); // maps to kTextSub
// ignore: constant_identifier_names
const kBg   = kBgMain;

class LotteryApp extends StatelessWidget {
  const LotteryApp({super.key});

  @override
  Widget build(BuildContext context) {
    final textTheme = GoogleFonts.interTextTheme(
      ThemeData.light().textTheme,
    );

    return MaterialApp(
      title: 'Ajith Rohana Enterprise',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: kPrimary,
          brightness: Brightness.light,
          primary: kPrimary,
          surface: kCardBg,
          error: kRed,
        ),
        scaffoldBackgroundColor: kBgMain,
        textTheme: textTheme,
        appBarTheme: AppBarTheme(
          backgroundColor: kCardBg,
          foregroundColor: kText,
          elevation: 0,
          centerTitle: false,
          scrolledUnderElevation: 1,
          shadowColor: kBorder.withValues(alpha: 0.5),
          titleTextStyle: GoogleFonts.inter(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: kText,
          ),
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: kCardBg,
          indicatorColor: kBlueLight,
          surfaceTintColor: Colors.transparent,
          labelTextStyle: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return GoogleFonts.inter(
                fontSize: 10, fontWeight: FontWeight.w600, color: kPrimary);
            }
            return GoogleFonts.inter(
              fontSize: 10, fontWeight: FontWeight.w500, color: kTextSub);
          }),
          iconTheme: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return const IconThemeData(color: kPrimary, size: 22);
            }
            return IconThemeData(color: kTextSub, size: 22);
          }),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: kPrimary,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            textStyle: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: kPrimary,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            textStyle: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: kBgMain,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: kBorder),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: kBorder),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: kPrimary, width: 1.5),
          ),
          labelStyle: GoogleFonts.inter(color: kTextSub, fontSize: 14),
        ),
        snackBarTheme: SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          contentTextStyle: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w500),
        ),
        cardTheme: CardThemeData(
          color: kCardBg,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: const BorderSide(color: kBorder),
          ),
        ),
        dividerTheme: const DividerThemeData(
          color: kBorder,
          thickness: 1,
          space: 1,
        ),
      ),
      routes: {
        '/main': (_) => const SplashScreen(),
      },
      home: const SplashScreen(),
    );
  }
}
