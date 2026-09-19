import 'package:flutter/material.dart';

class RatingWidget extends StatelessWidget {
  const RatingWidget({
    super.key,
    required this.rating,
    this.completedJobs,
    this.compact = false,
  });

  final double rating;
  final int? completedJobs;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final text = compact
        ? rating.toStringAsFixed(1)
        : '${rating.toStringAsFixed(1)}${completedJobs == null ? '' : ' · $completedJobs jobs'}';
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          Icons.star_rounded,
          size: compact ? 16 : 18,
          color: const Color(0xFFF4B400),
        ),
        const SizedBox(width: 4),
        Text(
          text,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}
