import 'package:flutter/material.dart';
import '../app.dart';
import 'stock_purchase_screen.dart';
import 'stock_return_screen.dart';
import 'invoice_screen.dart';
import 'winning_tickets_screen.dart';
import 'pairing_screen.dart';
import '../services/session_service.dart';

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});
  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _currentIndex = 0;
  RelayStatus _connStatus = RelayStatus.disconnected;

  final _screens = const [
    StockPurchaseScreen(),
    StockReturnScreen(),
    InvoiceScreen(),
    WinningTicketsScreen(),
  ];

  @override
  void initState() {
    super.initState();
    SessionService().statusStream.listen((s) {
      if (mounted) setState(() => _connStatus = s);
    });
    _connStatus = SessionService().status;
    SessionService().loadAndConnect();
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionService();
    return Scaffold(
      appBar: AppBar(
        backgroundColor: kDark,
        elevation: 0,
        titleSpacing: 0,
        title: Padding(
          padding: const EdgeInsets.only(left: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Ajith Rohana Enterprise',
                  style: TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w900, color: Colors.white)),
              Text(
                session.sessionId != null
                    ? 'Session: ${session.sessionId}'
                    : 'Lottery Scanner',
                style: TextStyle(
                    fontSize: 10,
                    color: Colors.white.withOpacity(0.55)),
              ),
            ],
          ),
        ),
        actions: [
          // Connection status badge
          GestureDetector(
            onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PairingScreen())),
            child: Container(
              margin: const EdgeInsets.only(right: 14),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: _connColor().withOpacity(0.15),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: _connColor().withOpacity(0.35)),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: _connColor(),
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(
                        color: _connColor().withOpacity(0.5), blurRadius: 4)],
                  ),
                ),
                const SizedBox(width: 5),
                Text(_connLabel(),
                    style: TextStyle(
                        color: _connColor(),
                        fontSize: 11,
                        fontWeight: FontWeight.w700)),
              ]),
            ),
          ),
        ],
      ),
      body: IndexedStack(index: _currentIndex, children: _screens),
      bottomNavigationBar: Theme(
        data: Theme.of(context).copyWith(
          navigationBarTheme: NavigationBarThemeData(
            labelTextStyle: WidgetStateProperty.resolveWith((states) {
              if (states.contains(WidgetState.selected)) {
                return const TextStyle(
                    color: kPrimary, fontSize: 11, fontWeight: FontWeight.w700);
              }
              return TextStyle(
                  color: Colors.grey.shade500,
                  fontSize: 11, fontWeight: FontWeight.w500);
            }),
          ),
        ),
        child: NavigationBar(
          selectedIndex: _currentIndex,
          onDestinationSelected: (i) => setState(() => _currentIndex = i),
          backgroundColor: Colors.white,
          shadowColor: Colors.black12,
          elevation: 8,
          height: 64,
          indicatorColor: kPrimary.withOpacity(0.10),
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.inventory_2_outlined, size: 22),
              selectedIcon: Icon(Icons.inventory_2, color: kPrimary, size: 22),
              label: 'Purchases',
            ),
            NavigationDestination(
              icon: Icon(Icons.keyboard_return_outlined, size: 22),
              selectedIcon: Icon(Icons.keyboard_return, color: kPrimary, size: 22),
              label: 'Returns',
            ),
            NavigationDestination(
              icon: Icon(Icons.receipt_long_outlined, size: 22),
              selectedIcon: Icon(Icons.receipt_long, color: kPrimary, size: 22),
              label: 'Invoice',
            ),
            NavigationDestination(
              icon: Icon(Icons.star_outline, size: 22),
              selectedIcon: Icon(Icons.star, color: kPrimary, size: 22),
              label: 'Winning',
            ),
          ],
        ),
      ),
    );
  }

  Color _connColor() => switch (_connStatus) {
    RelayStatus.connected    => const Color(0xFF16A34A),
    RelayStatus.connecting   => const Color(0xFFF59E0B),
    RelayStatus.disconnected => const Color(0xFFEF4444),
  };

  String _connLabel() => switch (_connStatus) {
    RelayStatus.connected    => 'Connected',
    RelayStatus.connecting   => 'Connecting',
    RelayStatus.disconnected => 'Not paired',
  };
}
