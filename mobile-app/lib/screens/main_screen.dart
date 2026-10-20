import 'package:flutter/material.dart';
import '../app.dart';
import 'stock_purchase_screen.dart';
import 'stock_return_screen.dart';
import 'invoice_screen.dart';
import 'winning_tickets_screen.dart';
import '../services/session_service.dart';

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});
  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _currentIndex = 0;

  final _screens = const [
    StockPurchaseScreen(),
    StockReturnScreen(),
    InvoiceScreen(),
    WinningTicketsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    final session = SessionService();
    return Scaffold(
      appBar: AppBar(
        title: Column(children: [
          const Text('Ajith Rohana Enterprise', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900)),
          Text(
            session.sessionId != null ? 'Session: ${session.sessionId}' : 'Lottery Scanner',
            style: TextStyle(fontSize: 10, color: Colors.white.withOpacity(0.65)),
          ),
        ]),
        actions: [
          IconButton(
            icon: Icon(
              session.connected ? Icons.link : Icons.link_off,
              color: session.connected ? Colors.greenAccent : Colors.white54,
              size: 20,
            ),
            tooltip: session.connected ? 'Connected to desktop' : 'Not paired',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const _PairingHint()),
            ),
          ),
        ],
      ),
      body: IndexedStack(index: _currentIndex, children: _screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (i) => setState(() => _currentIndex = i),
        backgroundColor: Colors.white,
        indicatorColor: kPrimary.withOpacity(0.12),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.inventory_2_outlined), selectedIcon: Icon(Icons.inventory_2, color: kPrimary), label: 'Purchases'),
          NavigationDestination(icon: Icon(Icons.keyboard_return_outlined), selectedIcon: Icon(Icons.keyboard_return, color: kPrimary), label: 'Returns'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long, color: kPrimary), label: 'Invoice'),
          NavigationDestination(icon: Icon(Icons.star_outline), selectedIcon: Icon(Icons.star, color: kPrimary), label: 'Winning'),
        ],
      ),
    );
  }
}

class _PairingHint extends StatelessWidget {
  const _PairingHint();
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Connection')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(SessionService().connected ? Icons.check_circle : Icons.link_off,
              size: 64, color: SessionService().connected ? Colors.green : Colors.grey),
            const SizedBox(height: 16),
            Text(
              SessionService().connected
                ? 'Connected to desktop\nSession: ${SessionService().sessionId}'
                : 'Not connected to desktop',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ]),
        ),
      ),
    );
  }
}
