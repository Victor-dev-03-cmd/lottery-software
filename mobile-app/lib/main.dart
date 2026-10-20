import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'app.dart';
import 'services/session_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));

  // Load saved Supabase config
  final prefs = await SharedPreferences.getInstance();
  final url = prefs.getString('supabase_url') ?? '';
  final key = prefs.getString('supabase_key') ?? '';

  if (url.isNotEmpty && key.isNotEmpty) {
    try {
      await Supabase.initialize(url: url, anonKey: key);
    } catch (_) {}
  }

  runApp(LotteryApp(supabaseReady: url.isNotEmpty && key.isNotEmpty));
}
