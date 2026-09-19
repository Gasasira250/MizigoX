import 'package:flutter/material.dart';

import '../models/professional.dart';
import '../theme/app_theme.dart';
import '../utils/format.dart';
import '../widgets/verified_badge.dart';

class ProfessionalDetailScreen extends StatelessWidget {
  const ProfessionalDetailScreen({super.key, required this.professional});

  final Professional professional;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Professional')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          Text(
            professional.name,
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 12),
          VerifiedBadge(professional: professional),
          const SizedBox(height: 18),
          Text(
            professional.trade,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 16),
          _InfoRow(
            label: 'Rating',
            value: professional.rating.toStringAsFixed(1),
          ),
          _InfoRow(
            label: 'Jobs completed',
            value: professional.jobsCompleted.toString(),
          ),
          const SizedBox(height: 20),
          const Text(
            'Services',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          for (final service in professional.services)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text('• $service', style: const TextStyle(fontSize: 16)),
            ),
          const SizedBox(height: 16),
          const Text(
            'Location',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(professional.location, style: const TextStyle(fontSize: 16)),
          const SizedBox(height: 16),
          Text(
            'From ${formatRwf(professional.serviceFeeRwf)}',
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.forest,
            ),
          ),
          const SizedBox(height: 28),
          FilledButton(
            onPressed: () {
              Navigator.of(context)
                  .pushNamed('/booking', arguments: professional);
            },
            child: const Text('Book Service'),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        '$label: $value',
        style: const TextStyle(fontSize: 16, color: AppColors.ink),
      ),
    );
  }
}
