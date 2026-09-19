import '../models/booking.dart';

/// Backend-style booking engine used by the demo app.
///
/// Cancellation and refunds are calculated here — not in the widgets — so the
/// Flutter client only displays the quote returned by this service. In
/// production this logic lives on the API with PostgreSQL as the source of
/// truth, because a client app can be manipulated.
class BookingService {
  BookingService({this.transportFeeRwf = 2000});

  /// Transport / cancellation fee charged once the professional is en route
  /// or on site. Confirmed bookings that have not started a journey refund in
  /// full.
  final int transportFeeRwf;

  final List<Booking> _bookings = [];
  int _sequence = 1;

  List<Booking> list() => List.unmodifiable(_bookings);

  Booking? findById(String id) {
    for (final booking in _bookings) {
      if (booking.id == id) return booking;
    }
    return null;
  }

  /// Simulates a successful payment webhook, then confirms the booking.
  Booking confirmPayment({
    required BookingDraft draft,
    required PaymentMethod method,
    DateTime? now,
  }) {
    final booking = Booking(
      id: 'KG-${_sequence.toString().padLeft(6, '0')}',
      professionalId: draft.professionalId,
      professionalName: draft.professionalName,
      trade: draft.trade,
      service: draft.service,
      scheduledAt: draft.scheduledAt,
      location: draft.location,
      description: draft.description,
      serviceFeeRwf: draft.serviceFeeRwf,
      status: BookingStatus.confirmed,
      paymentMethod: method,
      paid: true,
      createdAt: now ?? DateTime.now(),
    );
    _sequence += 1;
    _bookings.insert(0, booking);
    return booking;
  }

  /// Backend refund quote. The mobile app must not re-implement this math.
  CancellationQuote quoteCancellation(Booking booking) {
    if (booking.status == BookingStatus.cancelled) {
      return CancellationQuote(
        canCancel: false,
        cancellationFeeRwf: booking.cancellationFeeRwf ?? 0,
        refundAmountRwf: booking.refundAmountRwf ?? 0,
        title: 'Already cancelled',
        message: 'This booking is already cancelled.',
      );
    }

    if (booking.status == BookingStatus.completed) {
      return const CancellationQuote(
        canCancel: false,
        cancellationFeeRwf: 0,
        refundAmountRwf: 0,
        title: 'Cancellation isn\'t available',
        message: 'Completed bookings cannot be cancelled.',
      );
    }

    if (booking.status == BookingStatus.confirmed) {
      return CancellationQuote(
        canCancel: true,
        cancellationFeeRwf: 0,
        refundAmountRwf: booking.serviceFeeRwf,
        title: 'Cancel booking',
        message:
            'Booking is confirmed.\n\nYou will receive a full refund of ${booking.serviceFeeRwf} RWF.',
      );
    }

    final refund = booking.serviceFeeRwf - transportFeeRwf;
    final onTheWay = booking.status == BookingStatus.enRoute;
    return CancellationQuote(
      canCancel: true,
      cancellationFeeRwf: transportFeeRwf,
      refundAmountRwf: refund < 0 ? 0 : refund,
      title: onTheWay
          ? 'Professional is already on the way'
          : 'Professional is already on site',
      message: onTheWay
          ? 'Professional is already on the way.\n\nCancellation fee: $transportFeeRwf RWF'
          : 'The professional is already on site.\n\nCancellation fee: $transportFeeRwf RWF',
    );
  }

  Booking cancel(String bookingId, {DateTime? now}) {
    final current = _require(bookingId);
    final quote = quoteCancellation(current);
    if (!quote.canCancel) {
      throw StateError(quote.message);
    }
    final cancelled = current.copyWith(
      status: BookingStatus.cancelled,
      cancellationFeeRwf: quote.cancellationFeeRwf,
      refundAmountRwf: quote.refundAmountRwf,
      cancelledAt: now ?? DateTime.now(),
    );
    _replace(cancelled);
    return cancelled;
  }

  /// Called by the professional app (Start Journey, Arrived, etc.).
  Booking advanceStatus(String bookingId, BookingStatus next) {
    final current = _require(bookingId);
    if (!_canTransition(current.status, next)) {
      throw StateError(
        'Cannot move from ${current.statusLabel} to ${next.name}.',
      );
    }
    final updated = current.copyWith(status: next);
    _replace(updated);
    return updated;
  }

  Booking nextProfessionalAction(String bookingId) {
    final current = _require(bookingId);
    final next = switch (current.status) {
      BookingStatus.confirmed => BookingStatus.enRoute,
      BookingStatus.enRoute => BookingStatus.arrived,
      BookingStatus.arrived => BookingStatus.inProgress,
      BookingStatus.inProgress => BookingStatus.completed,
      BookingStatus.completed || BookingStatus.cancelled => null,
    };
    if (next == null) {
      throw StateError('No further professional action for this booking.');
    }
    return advanceStatus(bookingId, next);
  }

  String? nextProfessionalActionLabel(BookingStatus status) {
    return switch (status) {
      BookingStatus.confirmed => 'Start Journey',
      BookingStatus.enRoute => 'Mark Arrived',
      BookingStatus.arrived => 'Start Job',
      BookingStatus.inProgress => 'Complete Job',
      BookingStatus.completed || BookingStatus.cancelled => null,
    };
  }

  bool _canTransition(BookingStatus from, BookingStatus to) {
    return switch (from) {
      BookingStatus.confirmed => to == BookingStatus.enRoute,
      BookingStatus.enRoute => to == BookingStatus.arrived,
      BookingStatus.arrived => to == BookingStatus.inProgress,
      BookingStatus.inProgress => to == BookingStatus.completed,
      BookingStatus.completed || BookingStatus.cancelled => false,
    };
  }

  Booking _require(String id) {
    final booking = findById(id);
    if (booking == null) {
      throw StateError('Booking $id was not found.');
    }
    return booking;
  }

  void _replace(Booking booking) {
    final index = _bookings.indexWhere((item) => item.id == booking.id);
    if (index == -1) {
      throw StateError('Booking ${booking.id} was not found.');
    }
    _bookings[index] = booking;
  }
}
