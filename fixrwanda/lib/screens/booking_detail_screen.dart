import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/booking.dart';
import '../models/payment.dart';
import '../providers/booking_provider.dart';
import '../providers/payment_provider.dart';
import '../providers/professional_provider.dart';
import '../utils/constants.dart';
import '../utils/formatters.dart';
import '../widgets/booking_status_widget.dart';
import '../widgets/empty_state.dart';
import '../widgets/primary_button.dart';
import 'payment_screen.dart';

class BookingDetailScreen extends StatelessWidget {
  const BookingDetailScreen({super.key});

  static const routeName = '/booking-detail';

  @override
  Widget build(BuildContext context) {
    final id = ModalRoute.of(context)!.settings.arguments as String;
    final bookings = context.watch<BookingProvider>();
    final booking = bookings.byId(id);
    if (booking == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Booking')),
        body: const EmptyState(title: 'Booking not found', message: 'It may have been created in another session.'),
      );
    }
    final professional = context.watch<ProfessionalProvider>().professionalById(booking.professionalId);
    final refund = bookings.previewRefund(booking);

    return Scaffold(
      appBar: AppBar(title: const Text('Booking details')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  professional?.name ?? 'Professional',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
              BookingStatusWidget(status: booking.status),
            ],
          ),
          const SizedBox(height: 12),
          Text(Formatters.dateTime(booking.scheduledAt)),
          Text(booking.address),
          const SizedBox(height: 8),
          Text(Formatters.rwf(booking.amountRwf), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          if (booking.payment != null) Text('Payment: ${booking.payment!.status.label} ${booking.payment!.reference ?? ''}'),
          if (booking.notes.isNotEmpty) Text('Notes: ${booking.notes}'),
          const SizedBox(height: 20),
          Text('Status tracking', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          BookingTimeline(status: booking.status),
          const SizedBox(height: 12),
          Text(
            'This demo lets you move a confirmed booking through: confirmed → en_route → arrived → in_progress → completed. The same rules live in BookingPolicy, not in this screen.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (bookings.canAdvance(booking)) ...[
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () => bookings.advance(booking),
              child: const Text('Simulate next status'),
            ),
          ],
          if (booking.payment?.isSuccess != true) ...[
            const SizedBox(height: 12),
            PrimaryButton(
              label: 'Retry mock payment',
              onPressed: () {
                context.read<PaymentProvider>().clear();
                context.read<BookingProvider>().startDraft(
                      BookingDraft(
                        professionalId: booking.professionalId,
                        serviceCategoryId: booking.serviceCategoryId,
                        scheduledAt: booking.scheduledAt,
                        address: booking.address,
                        notes: booking.notes,
                        amountRwf: booking.amountRwf,
                      ),
                    );
                Navigator.of(context).pushNamed(PaymentScreen.routeName, arguments: booking.id);
              },
            ),
          ],
          if (booking.refundAmountRwf != null) ...[
            const SizedBox(height: 16),
            Text('Refund issued: ${Formatters.rwf(booking.refundAmountRwf!)}'),
            if (booking.cancellationReason != null) Text(booking.cancellationReason!),
          ],
          const SizedBox(height: 20),
          if (bookings.canCancel(booking))
            OutlinedButton(
              onPressed: () async {
                final confirmed = await showDialog<bool>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Cancel booking?'),
                    content: Text(refund.message),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep booking')),
                      FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Cancel booking')),
                    ],
                  ),
                );
                if (confirmed == true && context.mounted) {
                  try {
                    await bookings.cancel(booking);
                  } catch (error) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
                    }
                  }
                }
              },
              child: Text('Cancel · refund ${Formatters.rwf(refund.refundAmountRwf)}'),
            )
          else if (booking.status != BookingStatus.cancelled)
            Text(
              refund.message,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          const SizedBox(height: 12),
          Text(
            'Transport fee rule: ${Formatters.rwf(AppConstants.transportFeeRwf)} if the professional is already en route or has arrived.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
