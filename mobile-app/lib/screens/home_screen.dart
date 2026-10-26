import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../app.dart';
import '../services/session_service.dart';
import 'winning_tickets_screen.dart';

class HomeScreen extends StatefulWidget {
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

  Color get _connColor => switch (_status) {
    RelayStatus.connected    => kGreen,
    RelayStatus.connecting   => kYellow,
    RelayStatus.disconnected => kTextSub,
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

  IconData get _connIcon => switch (_status) {
    RelayStatus.connected    => Icons.wifi_rounded,
    RelayStatus.connecting   => Icons.wifi_find_rounded,
    RelayStatus.disconnected => Icons.wifi_off_rounded,
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBgMain,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          // ── App bar ───────────────────────────────────────────────────────
          SliverAppBar(
            pinned: true,
            floating: false,
            backgroundColor: kCardBg,
            scrolledUnderElevation: 1,
            shadowColor: kBorder.withValues(alpha: 0.5),
            titleSpacing: 20,
            title: Row(children: [
              // Brand symbol (small)
              _SmallBrandMark(),
              const SizedBox(width: 12),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Ajith Rohana Enterprise',
                  style: GoogleFonts.inter(
                    fontSize: 15, fontWeight: FontWeight.w700, color: kText)),
                Text('Lottery Distribution',
                  style: GoogleFonts.inter(
                    fontSize: 11, fontWeight: FontWeight.w400, color: kTextSub)),
              ]),
            ]),
            actions: [
              // Connection badge
              GestureDetector(
                onTap: () => widget.onNavigate(4),
                child: Container(
                  margin: const EdgeInsets.only(right: 16),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: _connColor.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: _connColor.withValues(alpha: 0.30)),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(_connIcon, size: 14, color: _connColor),
                    const SizedBox(width: 5),
                    Text(_connLabel,
                      style: GoogleFonts.inter(
                        fontSize: 11, fontWeight: FontWeight.w600, color: _connColor)),
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
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // ── Welcome header ───────────────────────────────────────────────────
        Text('Welcome back',
          style: GoogleFonts.inter(
            fontSize: 13, fontWeight: FontWeight.w400, color: kTextSub)),
        const SizedBox(height: 2),
        Text('Dashboard',
          style: GoogleFonts.inter(
            fontSize: 26, fontWeight: FontWeight.w700, color: kText,
            letterSpacing: -0.5)),
        const SizedBox(height: 20),

        // ── Desktop connection card ──────────────────────────────────────────
        _ConnectionCard(
          status: _status,
          connColor: _connColor,
          connLabel: _connLabel,
          connSub: _connSub,
          connIcon: _connIcon,
          onSettingsTap: () => widget.onNavigate(4),
        ),
        const SizedBox(height: 24),

        // ── Quick actions ────────────────────────────────────────────────────
        Text('Quick Actions',
          style: GoogleFonts.inter(
            fontSize: 13, fontWeight: FontWeight.w700,
            color: kText, letterSpacing: 0.1)),
        const SizedBox(height: 12),

        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.30,
          children: [
            _ActionCard(
              icon: Icons.inventory_2_rounded,
              label: 'Purchases',
              subtitle: 'Scan & record stock',
              color: kPrimary,
              bgColor: kBlueLight,
              onTap: () => widget.onNavigate(1),
            ),
            _ActionCard(
              icon: Icons.assignment_return_rounded,
              label: 'Returns',
              subtitle: 'Return unsold tickets',
              color: kRed,
              bgColor: const Color(0xFFFCE8E6),
              onTap: () => widget.onNavigate(2),
            ),
            _ActionCard(
              icon: Icons.receipt_long_rounded,
              label: 'Invoice',
              subtitle: 'Build agent invoices',
              color: kPrimary,
              bgColor: kBlueLight,
              onTap: () => widget.onNavigate(3),
            ),
            _ActionCard(
              icon: Icons.emoji_events_rounded,
              label: 'Winning',
              subtitle: 'Record winners',
              color: const Color(0xFFF29900),
              bgColor: const Color(0xFFFFF8E1),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const WinningTicketsScreen()),
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),

        // ── App info card ─────────────────────────────────────────────────────
        Text('About',
          style: GoogleFonts.inter(
            fontSize: 13, fontWeight: FontWeight.w700,
            color: kText, letterSpacing: 0.1)),
        const SizedBox(height: 10),

        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: kCardBg,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: kBorder),
          ),
          child: Row(children: [
            Container(
              width: 44,
              height: 44,
              alignment: Alignment.center,
              child: _SmallBrandMark(size: 36),
            ),
            const SizedBox(width: 14),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Ajith Rohana Enterprise',
                  style: GoogleFonts.inter(
                    fontWeight: FontWeight.w700, fontSize: 13, color: kText)),
                const SizedBox(height: 3),
                Text('Scan NLB/DLB tickets · Sync to desktop in real-time',
                  style: GoogleFonts.inter(fontSize: 11, color: kTextSub)),
              ],
            )),
          ]),
        ),
      ]),
    );
  }
}

// ── Small brand mark (2×2 color squares) ────────────────────────────────────

class _SmallBrandMark extends StatelessWidget {
  final double size;
  const _SmallBrandMark({this.size = 32});

  @override
  Widget build(BuildContext context) => CustomPaint(
    size: Size(size, size),
    painter: _MiniMarkPainter(),
  );
}

class _MiniMarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    const gap = 3.0;
    const r = Radius.circular(5);
    final h = (size.width - gap) / 2;
    final pairs = [
      (Rect.fromLTWH(0, 0, h, h), const Color(0xFF4285F4)),
      (Rect.fromLTWH(h + gap, 0, h, h), const Color(0xFFEA4335)),
      (Rect.fromLTWH(0, h + gap, h, h), const Color(0xFFFBBC04)),
      (Rect.fromLTWH(h + gap, h + gap, h, h), const Color(0xFF34A853)),
    ];
    for (final (rect, color) in pairs) {
      canvas.drawRRect(RRect.fromRectAndRadius(rect, r), Paint()..color = color);
    }
  }
  @override
  bool shouldRepaint(_) => false;
}

// ── Connection card ────────────────────────────────────────────────────────────

class _ConnectionCard extends StatelessWidget {
  final RelayStatus status;
  final Color connColor;
  final String connLabel;
  final String connSub;
  final IconData connIcon;
  final VoidCallback onSettingsTap;

  const _ConnectionCard({
    required this.status,
    required this.connColor,
    required this.connLabel,
    required this.connSub,
    required this.connIcon,
    required this.onSettingsTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onSettingsTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: kCardBg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: kBorder),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 10, offset: const Offset(0, 3)),
          ],
        ),
        child: Row(children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: connColor.withValues(alpha: 0.10),
              shape: BoxShape.circle,
            ),
            child: Icon(connIcon, color: connColor, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(connLabel,
                style: GoogleFonts.inter(
                  color: connColor, fontWeight: FontWeight.w700, fontSize: 13)),
              const SizedBox(height: 2),
              Text(connSub,
                style: GoogleFonts.inter(
                  color: kTextSub, fontSize: 11),
                maxLines: 1, overflow: TextOverflow.ellipsis),
            ],
          )),
          Icon(Icons.arrow_forward_ios_rounded, size: 13,
            color: kTextSub.withValues(alpha: 0.5)),
        ]),
      ),
    );
  }
}

// ── Quick action card ──────────────────────────────────────────────────────────

class _ActionCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final Color color;
  final Color bgColor;
  final VoidCallback onTap;

  const _ActionCard({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.color,
    required this.bgColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: kCardBg,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        splashColor: color.withValues(alpha: 0.08),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: kBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  color: bgColor,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: color, size: 22),
              ),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label,
                  style: GoogleFonts.inter(
                    fontWeight: FontWeight.w700, fontSize: 13, color: kText)),
                const SizedBox(height: 2),
                Text(subtitle,
                  style: GoogleFonts.inter(fontSize: 10, color: kTextSub),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              ]),
            ],
          ),
        ),
      ),
    );
  }
}
