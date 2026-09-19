import 'package:flutter/material.dart';

import '../models/professional.dart';
import '../models/service.dart';
import '../utils/formatters.dart';
import 'rating_widget.dart';
import 'verification_badge.dart';

class ProfessionalCard extends StatelessWidget {
  const ProfessionalCard({
    super.key,
    required this.professional,
    required this.category,
    required this.onTap,
  });

  final Professional professional;
  final ServiceCategory? category;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                child: Text(
                  professional.name.substring(0, 1),
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            professional.name,
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                          ),
                        ),
                        VerificationBadge(record: professional.verification, compact: true),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      category?.name ?? professional.specialty,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      professional.location,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        RatingWidget(
                          rating: professional.rating,
                          completedJobs: professional.completedJobs,
                        ),
                        const Spacer(),
                        Text(
                          Formatters.rwf(professional.startingPriceRwf),
                          style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
