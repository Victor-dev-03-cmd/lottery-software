import 'package:flutter/material.dart';
import 'screens/main_screen.dart';

const kPrimary = Color(0xFFCF291D);
const kDark    = Color(0xFF1D1D1D);
const kGrey    = Color(0xFF9CA3AF);
const kBg      = Color(0xFFF5F5F5);

class LotteryApp extends StatelessWidget {
  const LotteryApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Lottery Scanner',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: kPrimary, brightness: Brightness.light),
        scaffoldBackgroundColor: kBg,
        appBarTheme: const AppBarTheme(
          backgroundColor: kDark,
          foregroundColor: Colors.white,
          elevation: 0,
          centerTitle: true,
          titleTextStyle: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: 0.5),
        ),
      ),
      routes: {
        '/main': (_) => const MainScreen(),
      },
      home: const MainScreen(),
    );
  }
}
