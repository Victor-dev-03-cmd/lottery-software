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

  // Screens are kept alive via IndexedStack — state is never lost on tab switch.
  // HomeScreen receives a callback so its quick-action cards can switch tabs.
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
      bottomNavigationBar: _BottomNav(
        currentIndex: _currentIndex,
        onTap: (i) => setState(() => _currentIndex = i),
      ),
    );
  }
}

// ── Bottom navigation bar ─────────────────────────────────────────────────────

class _BottomNav extends StatelessWidget {
  final int currentIndex;
  final void Function(int) onTap;

  const _BottomNav({required this.currentIndex, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Theme.of(context).copyWith(
        navigationBarTheme: NavigationBarThemeData(
          labelTextStyle: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return const TextStyle(
                  color: kPrimary, fontSize: 10, fontWeight: FontWeight.w800);
            }
            return TextStyle(
                color: Colors.grey.shade500, fontSize: 10, fontWeight: FontWeight.w500);
          }),
        ),
      ),
      child: NavigationBar(
        selectedIndex: currentIndex,
        onDestinationSelected: onTap,
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        shadowColor: const Color(0x1A000000),
        elevation: 8,
        height: 62,
        indicatorColor: kPrimary.withOpacity(0.10),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined, size: 22),
            selectedIcon: Icon(Icons.home_rounded, color: kPrimary, size: 22),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.inventory_2_outlined, size: 22),
            selectedIcon: Icon(Icons.inventory_2_rounded, color: kPrimary, size: 22),
            label: 'Purchases',
          ),
          NavigationDestination(
            icon: Icon(Icons.keyboard_return_outlined, size: 22),
            selectedIcon: Icon(Icons.keyboard_return_rounded, color: kPrimary, size: 22),
            label: 'Returns',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined, size: 22),
            selectedIcon: Icon(Icons.receipt_long_rounded, color: kPrimary, size: 22),
            label: 'Invoice',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined, size: 22),
            selectedIcon: Icon(Icons.settings_rounded, color: kPrimary, size: 22),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}
