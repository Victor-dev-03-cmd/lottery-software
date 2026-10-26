import 'package:flutter/material.dart';
import '../app.dart';
import 'home_screen.dart';
import 'stock_purchase_screen.dart';
import 'stock_return_screen.dart';
import 'invoice_screen.dart';
import 'settings_screen.dart';

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});
  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _currentIndex = 0;

  late final List<Widget> _screens;

  @override
  void initState() {
    super.initState();
    _screens = [
      HomeScreen(onNavigate: (i) => setState(() => _currentIndex = i)),
      const StockPurchaseScreen(),
      const StockReturnScreen(),
      const InvoiceScreen(),
      const SettingsScreen(),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _currentIndex, children: _screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (i) => setState(() => _currentIndex = i),
        backgroundColor: kCardBg,
        surfaceTintColor: Colors.transparent,
        shadowColor: kBorder.withValues(alpha: 0.4),
        elevation: 8,
        height: 64,
        indicatorColor: kBlueLight,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded, color: kPrimary),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.inventory_2_outlined),
            selectedIcon: Icon(Icons.inventory_2_rounded, color: kPrimary),
            label: 'Purchases',
          ),
          NavigationDestination(
            icon: Icon(Icons.assignment_return_outlined),
            selectedIcon: Icon(Icons.assignment_return_rounded, color: kPrimary),
            label: 'Returns',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long_rounded, color: kPrimary),
            label: 'Invoice',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings_rounded, color: kPrimary),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}
