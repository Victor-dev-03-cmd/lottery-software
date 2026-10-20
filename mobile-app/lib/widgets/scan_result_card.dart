import 'package:flutter/material.dart';
import '../app.dart';
import '../models/ticket_data.dart';

class ScanResultCard extends StatelessWidget {
  final TicketData ticket;
  final bool compact;
  final bool highlight;
  const ScanResultCard({super.key, required this.ticket, this.compact = false, this.highlight = false});

  @override
  Widget build(BuildContext context) {
    final isNlb = ticket.board == 'NLB';
    final boardColor = isNlb ? const Color(0xFF1D4ED8) : const Color(0xFFC2410C);
    final boardBg    = isNlb ? const Color(0xFFEFF6FF) : const Color(0xFFFFF7ED);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: EdgeInsets.all(compact ? 10 : 14),
      decoration: BoxDecoration(
        color: highlight ? const Color(0xFFFFFBEB) : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: highlight ? const Color(0xFFFDE68A) : const Color(0xFFE8E8E8),
          width: highlight ? 1.5 : 1,
        ),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 4)],
      ),
      child: compact
        ? Row(children: [
            _boardBadge(boardColor, boardBg, isNlb),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(ticket.gameName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: kDark)),
              Text('Draw ${ticket.drawNumber} · ${ticket.drawDate}', style: const TextStyle(fontSize: 11, color: kGrey)),
            ])),
            Text(ticket.serialNumber.length > 12 ? '…${ticket.serialNumber.substring(ticket.serialNumber.length - 8)}' : ticket.serialNumber,
              style: TextStyle(fontSize: 10, color: boardColor, fontFamily: 'monospace', fontWeight: FontWeight.w700)),
          ])
        : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              _boardBadge(boardColor, boardBg, isNlb),
              const SizedBox(width: 8),
              Expanded(child: Text(ticket.gameName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: kDark))),
              if (highlight) const Icon(Icons.star, color: Color(0xFFD97706), size: 20),
            ]),
            const SizedBox(height: 10),
            _row('Draw No.', ticket.drawNumber),
            _row('Draw Date', ticket.drawDate),
            _row('Serial / Barcode', ticket.serialNumber, mono: true, color: boardColor),
          ]),
    );
  }

  Widget _boardBadge(Color color, Color bg, bool isNlb) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(isNlb ? 'NLB' : 'DLB',
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color)),
    );
  }

  Widget _row(String label, String value, {bool mono = false, Color? color}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(children: [
        SizedBox(width: 110, child: Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: kGrey))),
        Expanded(child: Text(value,
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color ?? kDark,
            fontFamily: mono ? 'monospace' : null))),
      ]),
    );
  }
}
