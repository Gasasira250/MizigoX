import 'package:flutter/material.dart';

import '../models/verification.dart';

class VerificationBadge extends StatelessWidget {
  const VerificationBadge({
    super.key,
    required this.record,
    this.compact = false,
  });

  final VerificationRecord record;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final color = switch (record.status) {
      VerificationStatus.verified => const Color(0xFF0E7C66),
      VerificationStatus.pending => const Color(0xFFB45309),
      VerificationStatus.rejected => const Color(0xFFB91C1C),
      VerificationStatus.expired => const Color(0xFF475569),
    };
    final icon = record.isFullyVerified ? Icons.verified : Icons.shield_outlined;
    final label = record.isFullyVerified ? 'Verified' : record.status.label;

    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 8 : 10, vertical: compact ? 4 : 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: compact ? 14 : 16, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: compact ? 11 : 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class VerificationChecklist extends StatelessWidget {
  const VerificationChecklist({super.key, required this.record});

  final VerificationRecord record;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _row(context, 'ID verification', record.idVerified),
        _row(context, 'Certificate / TVET verification', record.certificateVerified),
        _row(context, 'Phone verification', record.phoneVerified),
      ],
    );
  }

  Widget _row(BuildContext context, String label, bool ok) {
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      leading: Icon(
        ok ? Icons.check_circle : Icons.cancel,
        color: ok ? const Color(0xFF0E7C66) : const Color(0xFFB91C1C),
      ),
      title: Text(label),
      subtitle: Text(ok ? 'Mock record: complete' : 'Mock record: not complete'),
    );
  }
}
