import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/booking_provider.dart';
import '../providers/professional_provider.dart';
import '../utils/constants.dart';
import '../utils/formatters.dart';
import '../widgets/empty_state.dart';
import '../widgets/primary_button.dart';
import 'payment_screen.dart';

class BookingSummaryScreen extends StatelessWidget {
  const BookingSummaryScreen({super.key});

  static const routeName = '/booking-summary';

  @override
  Widget build(BuildContext context) {
    final draft = context.watch<BookingProvider>().draft;
    if (draft == null) {
      return const Scaffold(
        body: EmptyState(title: 'No booking to review', message: 'Start from a professional profile.'),
      );
    }
    final professional = context.watch<ProfessionalProvider>().professionalById(draft.professionalId);
    final category = context.watch<ProfessionalProvider>().categoryById(draft.serviceCategoryId);

    return Scaffold(
      appBar: AppBar(title: const Text('Booking summary')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _row(context, 'Professional', professional?.name ?? 'Unknown'),
          _row(context, 'Service', category?.name ?? draft.serviceCategoryId),
          _row(context, 'When', Formatters.dateTime(draft.scheduledAt)),
          _row(context, 'Address', draft.address),
          if (draft.notes.isNotEmpty) _row(context, 'Notes', draft.notes),
          _row(context, 'Amount', Formatters.rwf(draft.amountRwf)),
          const SizedBox(height: 16),
          Text(AppConstants.paymentsDisclaimer, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 24),
          PrimaryButton(
            label: 'Continue to payment',
            onPressed: () => Navigator.of(context).pushNamed(PaymentScreen.routeName),
          ),
        ],
      ),
    );
  }

  Widget _row(BuildContext context, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 4),
          Text(value, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
