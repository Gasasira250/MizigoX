import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/booking.dart';
import '../providers/booking_provider.dart';
import '../providers/professional_provider.dart';
import '../utils/formatters.dart';
import '../widgets/empty_state.dart';
import '../widgets/primary_button.dart';
import 'booking_detail_screen.dart';
import 'main_shell.dart';

class BookingSuccessScreen extends StatelessWidget {
  const BookingSuccessScreen({super.key});

  static const routeName = '/booking-result';

  @override
  Widget build(BuildContext context) {
    final id = ModalRoute.of(context)!.settings.arguments as String;
    final booking = context.watch<BookingProvider>().byId(id);
    if (booking == null) {
      return const Scaffold(body: EmptyState(title: 'Booking missing', message: 'Return home and open My Bookings.'));
    }
    final professional = context.watch<ProfessionalProvider>().professionalById(booking.professionalId);
    final success = booking.status != BookingStatus.pending && booking.payment?.isSuccess == true;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              Icon(
                success ? Icons.check_circle : Icons.error_outline,
                size: 88,
                color: success ? const Color(0xFF0E7C66) : Theme.of(context).colorScheme.error,
              ),
              const SizedBox(height: 16),
              Text(
                success ? 'Payment successful' : 'Payment failed',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              Text(
                success
                    ? 'Your booking with ${professional?.name ?? 'the professional'} is confirmed for ${Formatters.dateTime(booking.scheduledAt)}.'
                    : booking.payment?.failureReason ?? 'The mock payment did not go through. You can retry from My Bookings.',
                textAlign: TextAlign.center,
              ),
              if (success) ...[
                const SizedBox(height: 12),
                Text('Reference ${booking.payment?.reference ?? booking.id}'),
              ],
              const Spacer(),
              PrimaryButton(
                label: success ? 'View booking' : 'Back to booking details',
                onPressed: () => Navigator.of(context).pushNamedAndRemoveUntil(
                  BookingDetailScreen.routeName,
                  (route) => route.settings.name == MainShell.routeName,
                  arguments: booking.id,
                ),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => Navigator.of(context).pushNamedAndRemoveUntil(MainShell.routeName, (route) => false),
                child: const Text('Go home'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
