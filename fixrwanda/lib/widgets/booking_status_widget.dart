import 'package:flutter/material.dart';

import '../models/booking.dart';

class BookingStatusWidget extends StatelessWidget {
  const BookingStatusWidget({super.key, required this.status});

  final BookingStatus status;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      BookingStatus.pending => const Color(0xFFB45309),
      BookingStatus.confirmed => const Color(0xFF1D4E89),
      BookingStatus.enRoute => const Color(0xFF0E7C66),
      BookingStatus.arrived => const Color(0xFF0E7C66),
      BookingStatus.inProgress => const Color(0xFF7C3AED),
      BookingStatus.completed => const Color(0xFF047857),
      BookingStatus.cancelled => const Color(0xFFB91C1C),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        status.label,
        style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12),
      ),
    );
  }
}

class BookingTimeline extends StatelessWidget {
  const BookingTimeline({super.key, required this.status});

  final BookingStatus status;

  static const steps = BookingPolicySteps.steps;

  @override
  Widget build(BuildContext context) {
    final currentIndex = steps.indexOf(status);
    return Column(
      children: [
        for (var i = 0; i < steps.length; i++)
          _step(
            context,
            steps[i],
            done: currentIndex >= i && status != BookingStatus.cancelled,
            active: currentIndex == i,
            last: i == steps.length - 1,
          ),
      ],
    );
  }

  Widget _step(
    BuildContext context,
    BookingStatus step, {
    required bool done,
    required bool active,
    required bool last,
  }) {
    final color = done || active ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.outline;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Icon(
              done ? Icons.check_circle : Icons.radio_button_unchecked,
              color: color,
              size: 22,
            ),
            if (!last)
              Container(
                width: 2,
                height: 28,
                color: done ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.outlineVariant,
              ),
          ],
        ),
        const SizedBox(width: 12),
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(
            step.label,
            style: TextStyle(
              fontWeight: active ? FontWeight.w800 : FontWeight.w500,
              color: color,
            ),
          ),
        ),
      ],
    );
  }
}

class BookingPolicySteps {
  static const steps = [
    BookingStatus.confirmed,
    BookingStatus.enRoute,
    BookingStatus.arrived,
    BookingStatus.inProgress,
    BookingStatus.completed,
  ];
}
