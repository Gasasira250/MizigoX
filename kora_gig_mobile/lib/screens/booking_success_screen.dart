import 'package:flutter/material.dart';

import '../models/booking.dart';
import '../theme/app_theme.dart';

class BookingSuccessScreen extends StatelessWidget {
  const BookingSuccessScreen({super.key, required this.booking});

  final Booking booking;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
          child: Column(
            children: [
              Container(
                width: 88,
                height: 88,
                decoration: const BoxDecoration(
                  color: Color(0xFFD3F2E4),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check,
                  size: 44,
                  color: AppColors.forest,
                ),
              ),
              const SizedBox(height: 24),
              const Text(
                'Payment Successful ✓',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink,
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'Booking Confirmed',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.forest,
                ),
              ),
              const SizedBox(height: 18),
              Text(
                'Booking ID: ${booking.id}',
                style: const TextStyle(fontSize: 16, color: AppColors.muted),
              ),
              const Spacer(),
              FilledButton(
                onPressed: () {
                  Navigator.of(context)
                      .pushNamed('/booking-detail', arguments: booking.id);
                },
                child: const Text('View Booking'),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: () {
                  Navigator.of(context)
                      .pushNamedAndRemoveUntil('/home', (_) => false);
                },
                child: const Text('Back to Home'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
