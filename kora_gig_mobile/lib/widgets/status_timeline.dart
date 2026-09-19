import 'package:flutter/material.dart';

import '../models/booking.dart';
import '../theme/app_theme.dart';

class StatusTimeline extends StatelessWidget {
  const StatusTimeline({super.key, required this.status});

  final BookingStatus status;

  static const _steps = [
    BookingStatus.confirmed,
    BookingStatus.enRoute,
    BookingStatus.arrived,
    BookingStatus.inProgress,
    BookingStatus.completed,
  ];

  @override
  Widget build(BuildContext context) {
    final currentIndex = _steps.indexOf(status);
    return Column(
      children: [
        for (var i = 0; i < _steps.length; i++) ...[
          _StepRow(
            label: _label(_steps[i]),
            done: currentIndex >= i && currentIndex != -1,
            current: currentIndex == i,
          ),
          if (i < _steps.length - 1)
            Container(
              margin: const EdgeInsets.only(left: 11),
              alignment: Alignment.centerLeft,
              height: 18,
              width: 2,
              color: currentIndex > i ? AppColors.forest : AppColors.line,
            ),
        ],
      ],
    );
  }

  String _label(BookingStatus value) {
    return switch (value) {
      BookingStatus.confirmed => 'Confirmed',
      BookingStatus.enRoute => 'En Route',
      BookingStatus.arrived => 'Arrived',
      BookingStatus.inProgress => 'In Progress',
      BookingStatus.completed => 'Completed',
      BookingStatus.cancelled => 'Cancelled',
    };
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow({
    required this.label,
    required this.done,
    required this.current,
  });

  final String label;
  final bool done;
  final bool current;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: done ? AppColors.forest : Colors.white,
            border: Border.all(
              color: done ? AppColors.forest : AppColors.line,
              width: 2,
            ),
          ),
          child: done
              ? const Icon(Icons.check, size: 14, color: Colors.white)
              : null,
        ),
        const SizedBox(width: 12),
        Text(
          label.toUpperCase(),
          style: TextStyle(
            fontWeight: current ? FontWeight.w800 : FontWeight.w600,
            color: current
                ? AppColors.forest
                : done
                ? AppColors.ink
                : AppColors.muted,
          ),
        ),
      ],
    );
  }
}
