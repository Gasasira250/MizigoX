import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../models/booking.dart';
import '../theme/app_theme.dart';
import '../utils/format.dart';
import '../widgets/status_timeline.dart';

class BookingDetailScreen extends StatelessWidget {
  const BookingDetailScreen({super.key, required this.bookingId});

  final String bookingId;

  @override
  Widget build(BuildContext context) {
    final app = KoraGigScope.of(context);
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        final booking = app.bookings.findById(bookingId);
        if (booking == null) {
          return Scaffold(
            appBar: AppBar(title: const Text('Booking')),
            body: const Center(child: Text('Booking not found.')),
          );
        }

        final quote = app.quoteCancellation(booking);
        final nextAction = app.bookings.nextProfessionalActionLabel(
          booking.status,
        );

        return Scaffold(
          appBar: AppBar(title: Text(booking.id)),
          body: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  booking.professionalName,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(booking.service, style: const TextStyle(fontSize: 16)),
                const SizedBox(height: 6),
                Text(
                  '${formatDateTime(booking.scheduledAt)} • ${booking.location}',
                  style: const TextStyle(color: AppColors.muted),
                ),
                const SizedBox(height: 20),
                if (booking.status == BookingStatus.cancelled)
                  _Notice(
                    title: 'Booking cancelled',
                    body:
                        'Refund: ${formatRwf(booking.refundAmountRwf ?? 0)}\n'
                        'Cancellation fee: ${formatRwf(booking.cancellationFeeRwf ?? 0)}',
                    tone: AppColors.danger,
                  )
                else ...[
                  const Text(
                    'Booking status',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 12),
                  StatusTimeline(status: booking.status),
                ],
                const SizedBox(height: 24),
                _SummaryLine(
                  label: 'Paid with',
                  value: booking.paymentMethod.label,
                ),
                _SummaryLine(
                  label: 'Service fee',
                  value: formatRwf(booking.serviceFeeRwf),
                ),
                const SizedBox(height: 24),
                if (quote.canCancel) ...[
                  const Text(
                    'Cancellation',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    quote.title,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    quote.cancellationFeeRwf == 0
                        ? 'You will receive a full refund.'
                        : 'A transport fee is withheld because the professional has already started travelling or is on site.',
                  ),
                  const SizedBox(height: 8),
                  Text(
                    quote.cancellationFeeRwf == 0
                        ? 'Refund: ${formatRwf(quote.refundAmountRwf)}'
                        : 'Cancellation fee: ${formatRwf(quote.cancellationFeeRwf)}\nRefund: ${formatRwf(quote.refundAmountRwf)}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 14),
                  OutlinedButton(
                    onPressed: () => _confirmCancel(context, app, quote),
                    child: Text(
                      quote.cancellationFeeRwf == 0
                          ? 'Cancel Booking'
                          : 'Confirm Cancellation',
                    ),
                  ),
                ] else if (booking.status == BookingStatus.completed)
                  const _Notice(
                    title: "Cancellation isn't available",
                    body: 'Completed bookings cannot be cancelled.',
                    tone: AppColors.muted,
                  ),
                if (nextAction != null) ...[
                  const SizedBox(height: 28),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF8E8),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFFE8D59A)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Demo: professional app',
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'In production the professional taps this in a separate app. The backend stores the new status; Flutter only displays it.',
                          style: TextStyle(color: AppColors.muted),
                        ),
                        const SizedBox(height: 12),
                        FilledButton(
                          onPressed: () =>
                              app.simulateProfessionalAction(booking.id),
                          child: Text(nextAction),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _confirmCancel(
    BuildContext context,
    AppController app,
    CancellationQuote quote,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(quote.title),
          content: Text(
            'Cancellation fee: ${formatRwf(quote.cancellationFeeRwf)}\n'
            'Refund: ${formatRwf(quote.refundAmountRwf)}',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep booking'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Confirm'),
            ),
          ],
        );
      },
    );
    if (confirmed != true) return;
    final cancelled = app.cancelBooking(bookingId);
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Refund ${formatRwf(cancelled.refundAmountRwf ?? 0)}'),
      ),
    );
  }
}

class _SummaryLine extends StatelessWidget {
  const _SummaryLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: const TextStyle(color: AppColors.muted)),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.title, required this.body, required this.tone});

  final String title;
  final String body;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(fontWeight: FontWeight.w800, color: tone),
          ),
          const SizedBox(height: 6),
          Text(body),
        ],
      ),
    );
  }
}
