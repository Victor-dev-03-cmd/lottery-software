import 'dart:async';
import 'package:flutter/material.dart';
import '../app.dart';
import '../services/session_service.dart';
import 'winning_tickets_screen.dart';

class HomeScreen extends StatefulWidget {
  /// Called when a quick-action card should switch the bottom-nav tab.
  final void Function(int index) onNavigate;

  const HomeScreen({super.key, required this.onNavigate});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  RelayStatus _status = RelayStatus.disconnected;
  late final StreamSubscription<RelayStatus> _sub;

  @override
  void initState() {
    super.initState();
    _status = SessionService().status;
    _sub = SessionService().statusStream.listen((s) {
      if (mounted) setState(() => _status = s);
    });
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  Color get _connColor => switch (_status) {
    RelayStatus.connected    => const Color(0xFF16A34A),
    RelayStatus.connecting   => const Color(0xFFF59E0B),
    RelayStatus.disconnected => const Color(0xFFEF4444),
  };

  String get _connLabel => switch (_status) {
    RelayStatus.connected    => 'Connected',
    RelayStatus.connecting   => 'Connecting…',
    RelayStatus.disconnected => 'Not connected',
  };

  String get _connSub {
    final s = SessionService();
    return switch (_status) {
      RelayStatus.connected    => s.desktopHost ?? s.sessionId ?? 'Desktop',
      RelayStatus.connecting   => 'Reaching desktop…',
      RelayStatus.disconnected => 'Tap Settings to pair',
    };
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBg,
      body: CustomScrollView(
        slivers: [
          // ── Header ──────────────────────────────────────────────────────────
          SliverAppBar(
            expandedHeight: 160,
            floating: false,
            pinned: true,
            backgroundColor: kDark,
            elevation: 0,
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF1D1D1D), Color(0xFF2D1B1B)],
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 60, 20, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      const Text(
                        'Ajith Rohana Enterprise',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Lottery Distribution Manager',
                        style: TextStyle(
                          color: Colors.white54,
                          fontSize: 11,
                          fontWeight: FontWeight.w400,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            // Connection badge pinned in the app bar
            actions: [
              GestureDetector(
                onTap: () => widget.onNavigate(4), // go to Settings tab
                child: Container(
                  margin: const EdgeInsets.only(right: 16, top: 8, bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: _connColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: _connColor.withOpacity(0.40)),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: _connColor,
                        shape: BoxShape.circle,
                        boxShadow: [BoxShadow(
                          color: _connColor.withOpacity(0.6),
                          blurRadius: 5,
                        )],
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      _connLabel,
                      style: TextStyle(
                        color: _connColor,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ]),
                ),
              ),
            ],
          ),

          SliverToBoxAdapter(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildBody() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Connection detail card
        _ConnectionCard(
          status: _status,
          connColor: _connColor,
          connLabel: _connLabel,
          connSub: _connSub,
          onSettingsTap: () => widget.onNavigate(4),
        ),
        const SizedBox(height: 22),

        // Section heading
        const _SectionHeading('Quick Actions'),
        const SizedBox(height: 12),

        // 2×2 quick action grid
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.25,
          children: [
            _ActionCard(
              icon: Icons.inventory_2_rounded,
              label: 'Purchases',
              subtitle: 'Scan & record stock',
              color: kPrimary,
              onTap: () => widget.onNavigate(1),
            ),
            _ActionCard(
              icon: Icons.keyboard_return_rounded,
              label: 'Returns',
              subtitle: 'Return unsold tickets',
              color: const Color(0xFFEA580C),
              onTap: () => widget.onNavigate(2),
            ),
            _ActionCard(
              icon: Icons.receipt_long_rounded,
              label: 'Invoice',
              subtitle: 'Build agent invoices',
              color: const Color(0xFF2563EB),
              onTap: () => widget.onNavigate(3),
            ),
            _ActionCard(
              icon: Icons.star_rounded,
              label: 'Winning',
              subtitle: 'Record winners',
              color: const Color(0xFFD97706),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const WinningTicketsScreen()),
              ),
            ),
          ],
        ),

        const SizedBox(height: 24),
        const _SectionHeading('About'),
        const SizedBox(height: 10),

        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE8E8E8)),
          ),
          child: Row(children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: kPrimary.withOpacity(0.10),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.smartphone_rounded, color: kPrimary, size: 22),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Lottery Scanner', style: TextStyle(
                  fontWeight: FontWeight.w800, fontSize: 13, color: kDark)),
                SizedBox(height: 2),
                Text('Scan NLB/DLB tickets · Sync to desktop in real-time',
                  style: TextStyle(fontSize: 11, color: kGrey)),
              ]),
            ),
          ]),
        ),

        const SizedBox(height: 24),
      ]),
    );
  }
}

// ── Connection Card ────────────────────────────────────────────────────────────

class _ConnectionCard extends StatelessWidget {
  final RelayStatus status;
  final Color connColor;
  final String connLabel;
  final String connSub;
  final VoidCallback onSettingsTap;

  const _ConnectionCard({
    required this.status,
    required this.connColor,
    required this.connLabel,
    required this.connSub,
    required this.onSettingsTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onSettingsTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: connColor.withOpacity(0.25)),
          boxShadow: [
            BoxShadow(
              color: connColor.withOpacity(0.08),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(children: [
          // Pulsing status dot
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: connColor.withOpacity(0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(
              status == RelayStatus.connected
                  ? Icons.wifi_rounded
                  : status == RelayStatus.connecting
                      ? Icons.wifi_find_rounded
                      : Icons.wifi_off_rounded,
              color: connColor,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(connLabel, style: TextStyle(
                color: connColor, fontWeight: FontWeight.w800, fontSize: 13)),
              const SizedBox(height: 2),
              Text(connSub, style: const TextStyle(
                color: kGrey, fontSize: 11),
                maxLines: 1, overflow: TextOverflow.ellipsis),
            ],
          )),
          Icon(Icons.arrow_forward_ios_rounded, size: 14, color: kGrey.withOpacity(0.6)),
        ]),
      ),
    );
  }
}

// ── Quick Action Card ──────────────────────────────────────────────────────────

class _ActionCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const _ActionCard({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE8E8E8)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x0A000000),
              blurRadius: 8,
              offset: Offset(0, 3),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: color.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(
                fontWeight: FontWeight.w800, fontSize: 13, color: kDark)),
              const SizedBox(height: 2),
              Text(subtitle, style: TextStyle(
                fontSize: 10, color: kGrey.withOpacity(0.85)),
                maxLines: 1, overflow: TextOverflow.ellipsis),
            ]),
          ],
        ),
      ),
    );
  }
}

// ── Section heading ────────────────────────────────────────────────────────────

class _SectionHeading extends StatelessWidget {
  final String text;
  const _SectionHeading(this.text);

  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    style: TextStyle(
      fontSize: 10,
      fontWeight: FontWeight.w800,
      color: kGrey.withOpacity(0.8),
      letterSpacing: 0.9,
    ),
  );
}
