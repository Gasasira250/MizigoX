import 'package:uuid/uuid.dart';

import '../models/booking.dart';
import '../models/payment.dart';
import '../repositories/booking_repository.dart';
import 'booking_service.dart';

class BookingManager {
  BookingManager({
    required BookingRepository bookingRepository,
    BookingPolicy? policy,
    Uuid? uuid,
  })  : _repository = bookingRepository,
        _policy = policy ?? const BookingPolicy(),
        _uuid = uuid ?? const Uuid();

  final BookingRepository _repository;
  final BookingPolicy _policy;
  final Uuid _uuid;

  BookingPolicy get policy => _policy;

  Future<List<Booking>> bookingsFor(String customerId) {
    return _repository.getForCustomer(customerId);
  }

  Future<Booking?> findById(String id) => _repository.getById(id);

  Future<Booking> createPending({
    required String customerId,
    required BookingDraft draft,
  }) {
    final booking = Booking(
      id: 'bkg_${_uuid.v4()}',
      customerId: customerId,
      professionalId: draft.professionalId,
      serviceCategoryId: draft.serviceCategoryId,
      scheduledAt: draft.scheduledAt,
      address: draft.address,
      notes: draft.notes,
      amountRwf: draft.amountRwf,
      status: BookingStatus.pending,
      createdAt: DateTime.now(),
    );
    return _repository.create(booking);
  }

  Future<Booking> attachPayment({
    required Booking booking,
    required PaymentResult payment,
  }) {
    final nextStatus = payment.isSuccess ? BookingStatus.confirmed : BookingStatus.pending;
    return _repository.update(
      booking.copyWith(
        payment: payment,
        status: nextStatus,
      ),
    );
  }

  Future<Booking> advanceDemoStatus(Booking booking) {
    final next = _policy.nextStatus(booking.status);
    if (next == null) {
      throw BookingException('This booking cannot move to the next status.');
    }
    return _repository.update(booking.copyWith(status: next));
  }

  RefundResult previewRefund(Booking booking) {
    return _policy.calculateRefund(
      status: booking.status,
      amountRwf: booking.amountRwf,
    );
  }

  Future<Booking> cancel(Booking booking, {String? reason}) async {
    final refund = previewRefund(booking);
    if (!refund.allowed) {
      throw BookingException(refund.message);
    }
    return _repository.update(
      booking.copyWith(
        status: BookingStatus.cancelled,
        cancelledAt: DateTime.now(),
        refundAmountRwf: refund.refundAmountRwf,
        cancellationReason: reason ?? refund.message,
      ),
    );
  }
}
