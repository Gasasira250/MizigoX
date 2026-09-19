import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../models/booking.dart';
import '../theme/app_theme.dart';
import '../utils/format.dart';

class BookingsScreen extends StatelessWidget {
  const BookingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = KoraGigScope.of(context);
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        final upcoming = app.bookings.list().where((item) => item.isUpcoming);
        final past = app.bookings.list().where((item) => item.isPast);
        return SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
            children: [
              const Text(
                'My Bookings',
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink,
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'Upcoming',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 10),
              if (upcoming.isEmpty)
                const _EmptyNote(text: 'No upcoming bookings yet.')
              else
                for (final booking in upcoming) _BookingTile(booking: booking),
              const SizedBox(height: 24),
              const Text(
                'Past',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 10),
              if (past.isEmpty)
                const _EmptyNote(text: 'No past bookings yet.')
              else
                for (final booking in past) _BookingTile(booking: booking),
            ],
          ),
        );
      },
    );
  }
}

class _EmptyNote extends StatelessWidget {
  const _EmptyNote({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
      ),
      child: Text(text, style: const TextStyle(color: AppColors.muted)),
    );
  }
}

class _BookingTile extends StatelessWidget {
  const _BookingTile({required this.booking});

  final Booking booking;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () {
            Navigator.of(context)
                .pushNamed('/booking-detail', arguments: booking.id);
          },
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.line),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  booking.professionalName,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(booking.service),
                const SizedBox(height: 4),
                Text(
                  formatDateTime(booking.scheduledAt),
                  style: const TextStyle(color: AppColors.muted),
                ),
                const SizedBox(height: 10),
                Text(
                  booking.status == BookingStatus.completed
                      ? 'Completed ✓'
                      : booking.statusLabel,
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: booking.status == BookingStatus.cancelled
                        ? AppColors.danger
                        : AppColors.forest,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'View Booking',
                  style: TextStyle(
                    color: AppColors.forest,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
