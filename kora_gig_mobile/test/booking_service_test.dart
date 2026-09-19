import 'package:flutter_test/flutter_test.dart';
import 'package:kora_gig_mobile/models/booking.dart';
import 'package:kora_gig_mobile/services/booking_service.dart';

BookingDraft _draft() {
  return BookingDraft(
    professionalId: 'pro-john',
    professionalName: 'John Electrical Services',
    trade: 'Electrician',
    service: 'Electrical installation',
    scheduledAt: DateTime(2026, 9, 25, 10),
    location: 'Kigali',
    description: 'Need electrical wiring for my house.',
    serviceFeeRwf: 30000,
  );
}

Booking _paid(BookingService service) {
  return service.confirmPayment(
    draft: _draft(),
    method: PaymentMethod.mtnMomo,
    now: DateTime(2026, 9, 19),
  );
}

void main() {
  test('confirms a paid booking with KG-000001', () {
    final service = BookingService();
    final booking = _paid(service);
    expect(booking.id, 'KG-000001');
    expect(booking.status, BookingStatus.confirmed);
    expect(booking.paid, isTrue);
    expect(booking.paymentMethod, PaymentMethod.mtnMomo);
  });

  test('full refund before the professional is en route', () {
    final service = BookingService();
    final booking = _paid(service);
    final quote = service.quoteCancellation(booking);
    expect(quote.canCancel, isTrue);
    expect(quote.cancellationFeeRwf, 0);
    expect(quote.refundAmountRwf, 30000);

    final cancelled = service.cancel(booking.id);
    expect(cancelled.status, BookingStatus.cancelled);
    expect(cancelled.refundAmountRwf, 30000);
    expect(cancelled.cancellationFeeRwf, 0);
  });

  test('en-route cancellation withholds 2,000 RWF transport fee', () {
    final service = BookingService();
    final booking = _paid(service);
    service.advanceStatus(booking.id, BookingStatus.enRoute);

    final quote = service.quoteCancellation(service.findById(booking.id)!);
    expect(quote.canCancel, isTrue);
    expect(quote.cancellationFeeRwf, 2000);
    expect(quote.refundAmountRwf, 28000);
    expect(quote.title, contains('on the way'));

    final cancelled = service.cancel(booking.id);
    expect(cancelled.refundAmountRwf, 28000);
    expect(cancelled.cancellationFeeRwf, 2000);
  });

  test('on-site cancellation uses the same 2,000 RWF fee', () {
    final service = BookingService();
    final booking = _paid(service);
    service
      ..advanceStatus(booking.id, BookingStatus.enRoute)
      ..advanceStatus(booking.id, BookingStatus.arrived);

    final quote = service.quoteCancellation(service.findById(booking.id)!);
    expect(quote.cancellationFeeRwf, 2000);
    expect(quote.refundAmountRwf, 28000);
    expect(quote.title, contains('on site'));
  });

  test('completed bookings cannot be cancelled', () {
    final service = BookingService();
    final booking = _paid(service);
    service
      ..advanceStatus(booking.id, BookingStatus.enRoute)
      ..advanceStatus(booking.id, BookingStatus.arrived)
      ..advanceStatus(booking.id, BookingStatus.inProgress)
      ..advanceStatus(booking.id, BookingStatus.completed);

    final quote = service.quoteCancellation(service.findById(booking.id)!);
    expect(quote.canCancel, isFalse);
    expect(() => service.cancel(booking.id), throwsA(isA<StateError>()));
  });

  test('professional status follows confirmed → en route → arrived → in progress → completed', () {
    final service = BookingService();
    final booking = _paid(service);
    expect(
      service.nextProfessionalAction(booking.id).status,
      BookingStatus.enRoute,
    );
    expect(
      service.nextProfessionalAction(booking.id).status,
      BookingStatus.arrived,
    );
    expect(
      service.nextProfessionalAction(booking.id).status,
      BookingStatus.inProgress,
    );
    expect(
      service.nextProfessionalAction(booking.id).status,
      BookingStatus.completed,
    );
  });
}
