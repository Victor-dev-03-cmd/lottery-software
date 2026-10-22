import 'package:flutter/material.dart';
import '../app.dart';
import '../models/ticket_data.dart';

class ScanResultCard extends StatelessWidget {
  final TicketData ticket;
  final bool compact;
  final bool highlight;

  const ScanResultCard({
    super.key,
    required this.ticket,
    this.compact = false,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    final isNlb      = ticket.board == 'NLB';
    final boardColor = isNlb ? const Color(0xFF1D4ED8) : const Color(0xFFC2410C);
    final boardBg    = isNlb ? const Color(0xFFEFF6FF) : const Color(0xFFFFF7ED);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: highlight ? const Color(0xFFFFFBEB) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: highlight
              ? const Color(0xFFFDE68A)
              : const Color(0xFFE8E8E8),
          width: highlight ? 1.5 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: compact ? _buildCompact(boardColor, boardBg, isNlb)
                     : _buildFull(boardColor, boardBg, isNlb),
    );
  }

  // ── Compact row (recent scan list) ──────────────────────────────────────────

  Widget _buildCompact(Color boardColor, Color boardBg, bool isNlb) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(children: [
        _BoardBadge(color: boardColor, bg: boardBg, label: ticket.board),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(ticket.gameName, style: const TextStyle(
            fontWeight: FontWeight.w700, fontSize: 13, color: kDark)),
          const SizedBox(height: 2),
          Text('Draw ${ticket.drawNumber} · ${ticket.drawDate}',
            style: const TextStyle(fontSize: 11, color: kGrey)),
        ])),
        Text(
          _shortBarcode(ticket.barcodeStart),
          style: TextStyle(
            fontSize: 10, color: boardColor,
            fontFamily: 'monospace', fontWeight: FontWeight.w700,
          ),
        ),
      ]),
    );
  }

  // ── Full card (confirmation preview before push) ─────────────────────────────

  Widget _buildFull(Color boardColor, Color boardBg, bool isNlb) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Header strip
      Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: boardBg,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(13)),
          border: Border(bottom: BorderSide(color: boardColor.withOpacity(0.15))),
        ),
        child: Row(children: [
          _BoardBadge(color: boardColor, bg: Colors.white, label: ticket.board),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              ticket.gameName,
              style: const TextStyle(
                fontWeight: FontWeight.w900, fontSize: 15, color: kDark),
            ),
          ),
          if (highlight)
            const Icon(Icons.star_rounded, color: Color(0xFFD97706), size: 20),
        ]),
      ),

      // Fields
      Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
        child: Column(children: [
          _FieldRow(
            icon: Icons.confirmation_number_outlined,
            label: 'Draw No.',
            value: ticket.drawNumber,
            color: boardColor,
            mono: false,
          ),
          const SizedBox(height: 8),
          _FieldRow(
            icon: Icons.calendar_today_outlined,
            label: 'Draw Date',
            value: ticket.drawDate,
            color: kDark,
            mono: false,
          ),
          const SizedBox(height: 8),
          // Barcode — shown large and prominent
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: boardColor.withOpacity(0.06),
              borderRadius: BorderRadius.circular(9),
              border: Border.all(color: boardColor.withOpacity(0.20)),
            ),
            child: Row(children: [
              Icon(Icons.qr_code_rounded, color: boardColor, size: 18),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(
                  ticket.board == 'NLB' ? 'Barcode / Serial' : 'Ticket Barcode',
                  style: const TextStyle(
                    fontSize: 10, fontWeight: FontWeight.w600, color: kGrey),
                ),
                const SizedBox(height: 2),
                Text(
                  ticket.barcodeStart,
                  style: TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w900,
                    color: boardColor, fontFamily: 'monospace',
                    letterSpacing: 0.5,
                  ),
                ),
                if (ticket.board == 'DLB' && ticket.serialNumber != ticket.barcodeStart)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(
                      'QR raw: ${ticket.serialNumber}',
                      style: const TextStyle(fontSize: 9, color: kGrey),
                    ),
                  ),
              ])),
            ]),
          ),
        ]),
      ),
    ]);
  }

  String _shortBarcode(String s) =>
      s.length > 10 ? '…${s.substring(s.length - 8)}' : s;
}

// ── Board badge ──────────────────────────────────────────────────────────────

class _BoardBadge extends StatelessWidget {
  final Color color;
  final Color bg;
  final String label;

  const _BoardBadge({required this.color, required this.bg, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.30)),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: color),
      ),
    );
  }
}

// ── Field row ────────────────────────────────────────────────────────────────

class _FieldRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  final bool mono;

  const _FieldRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
    required this.mono,
  });

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Icon(icon, size: 15, color: kGrey.withOpacity(0.7)),
      const SizedBox(width: 8),
      SizedBox(
        width: 90,
        child: Text(label, style: const TextStyle(
          fontSize: 11, fontWeight: FontWeight.w600, color: kGrey)),
      ),
      Expanded(
        child: Text(
          value,
          style: TextStyle(
            fontSize: 13, fontWeight: FontWeight.w700, color: color,
            fontFamily: mono ? 'monospace' : null,
          ),
        ),
      ),
    ]);
  }
}
