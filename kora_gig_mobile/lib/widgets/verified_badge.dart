import 'package:flutter/material.dart';

import '../models/professional.dart';
import '../theme/app_theme.dart';

class VerifiedBadge extends StatelessWidget {
  const VerifiedBadge({
    super.key,
    required this.professional,
    this.compact = false,
  });

  final Professional professional;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    if (compact) {
      return Wrap(
        spacing: 8,
        runSpacing: 6,
        children: [
          if (professional.tvetVerified) const _Chip(label: '✓ TVET Verified'),
          if (professional.idVerified) const _Chip(label: '✓ ID Verified'),
          if (!professional.tvetVerified && !professional.idVerified)
            _Chip(label: professional.verificationLabel, tone: _ChipTone.muted),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: professional.isVerifiedProfessional
                ? const Color(0xFFD3F2E4)
                : const Color(0xFFFFF4E5),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            professional.isVerifiedProfessional
                ? '✓ Verified Professional'
                : professional.verificationLabel,
            style: TextStyle(
              color: professional.isVerifiedProfessional
                  ? AppColors.forestDark
                  : AppColors.warning,
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
        ),
        const SizedBox(height: 10),
        if (professional.tvetVerified) const _RowItem(label: '✓ TVET Verified'),
        if (professional.idVerified) const _RowItem(label: '✓ ID Verified'),
        if (!professional.tvetVerified)
          const _RowItem(label: 'TVET verification pending', muted: true),
        if (!professional.idVerified)
          const _RowItem(label: 'ID verification pending', muted: true),
      ],
    );
  }
}

enum _ChipTone { verified, muted }

class _Chip extends StatelessWidget {
  const _Chip({required this.label, this.tone = _ChipTone.verified});

  final String label;
  final _ChipTone tone;

  @override
  Widget build(BuildContext context) {
    final verified = tone == _ChipTone.verified;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: verified ? const Color(0xFFD3F2E4) : const Color(0xFFEEF1EF),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: verified ? AppColors.forestDark : AppColors.muted,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _RowItem extends StatelessWidget {
  const _RowItem({required this.label, this.muted = false});

  final String label;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text(
        label,
        style: TextStyle(
          color: muted ? AppColors.muted : AppColors.forestDark,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
