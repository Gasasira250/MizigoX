import 'package:flutter_test/flutter_test.dart';
import 'package:fixrwanda/models/booking.dart';
import 'package:fixrwanda/models/payment.dart';
import 'package:fixrwanda/repositories/mock_booking_repository.dart';
import 'package:fixrwanda/services/booking_manager.dart';
import 'package:fixrwanda/services/booking_service.dart';

void main() {
  late BookingPolicy policy;
  late MockBookingRepository repository;
  late BookingManager manager;

  setUp(() {
    policy = const BookingPolicy();
    repository = MockBookingRepository(delay: Duration.zero);
    manager = BookingManager(bookingRepository: repository, policy: policy);
  });

  Booking makeBooking({
    BookingStatus status = BookingStatus.confirmed,
    int amount = 25000,
  }) {
    return Booking(
      id: 'bkg_test',
      customerId: 'usr_demo_jean',
      professionalId: 'pro_eric',
      serviceCategoryId: 'electrical',
      scheduledAt: DateTime(2026, 9, 21, 9),
      address: 'KN 5 Rd, Kimihurura, Kigali',
      amountRwf: amount,
      status: status,
      createdAt: DateTime(2026, 9, 19),
    );
  }

  test('creating a booking stores a pending job for the customer', () async {
    final created = await manager.createPending(
      customerId: 'usr_demo_jean',
      draft: BookingDraft(
        professionalId: 'pro_eric',
        serviceCategoryId: 'electrical',
        scheduledAt: DateTime(2026, 9, 21, 9),
        address: 'KN 5 Rd, Kimihurura, Kigali',
        amountRwf: 25000,
      ),
    );

    expect(created.status, BookingStatus.pending);
    expect(created.amountRwf, 25000);
    final loaded = await manager.bookingsFor('usr_demo_jean');
    expect(loaded, hasLength(1));
    expect(loaded.first.id, created.id);
  });

  test('successful payment confirms the booking', () async {
    final pending = await manager.createPending(
      customerId: 'usr_demo_jean',
      draft: BookingDraft(
        professionalId: 'pro_eric',
        serviceCategoryId: 'electrical',
        scheduledAt: DateTime(2026, 9, 21, 9),
        address: 'KN 5 Rd, Kimihurura, Kigali',
        amountRwf: 25000,
      ),
    );
    final updated = await manager.attachPayment(
      booking: pending,
      payment: PaymentResult(
        id: 'pay_ok',
        method: PaymentMethod.mtnMomo,
        status: PaymentStatus.success,
        amountRwf: 25000,
        createdAt: DateTime.now(),
        reference: 'MOMO-OK',
      ),
    );
    expect(updated.status, BookingStatus.confirmed);
  });

  test('booking status moves confirmed → en_route → arrived → in_progress → completed', () async {
    var current = await repository.create(makeBooking());
    expect(policy.nextStatus(current.status), BookingStatus.enRoute);

    current = await manager.advanceDemoStatus(current);
    expect(current.status, BookingStatus.enRoute);
    current = await manager.advanceDemoStatus(current);
    expect(current.status, BookingStatus.arrived);
    current = await manager.advanceDemoStatus(current);
    expect(current.status, BookingStatus.inProgress);
    current = await manager.advanceDemoStatus(current);
    expect(current.status, BookingStatus.completed);
    expect(policy.nextStatus(current.status), isNull);
  });

  test('cancellation is blocked once work is in progress or completed', () {
    expect(policy.canCancel(BookingStatus.confirmed), isTrue);
    expect(policy.canCancel(BookingStatus.enRoute), isTrue);
    expect(policy.canCancel(BookingStatus.arrived), isTrue);
    expect(policy.canCancel(BookingStatus.inProgress), isFalse);
    expect(policy.canCancel(BookingStatus.completed), isFalse);
  });

  test('confirmed bookings receive a full refund', () {
    final refund = policy.calculateRefund(status: BookingStatus.confirmed, amountRwf: 25000);
    expect(refund.allowed, isTrue);
    expect(refund.refundAmountRwf, 25000);
    expect(refund.feeChargedRwf, 0);
  });

  test('en_route and arrived bookings keep a 2000 RWF transport fee', () {
    final enRoute = policy.calculateRefund(status: BookingStatus.enRoute, amountRwf: 25000);
    expect(enRoute.refundAmountRwf, 23000);
    expect(enRoute.feeChargedRwf, 2000);

    final arrived = policy.calculateRefund(status: BookingStatus.arrived, amountRwf: 25000);
    expect(arrived.refundAmountRwf, 23000);
    expect(arrived.feeChargedRwf, 2000);
  });

  test('in-progress jobs cannot be refunded', () {
    final refund = policy.calculateRefund(status: BookingStatus.inProgress, amountRwf: 25000);
    expect(refund.allowed, isFalse);
    expect(refund.refundAmountRwf, 0);
  });
}
