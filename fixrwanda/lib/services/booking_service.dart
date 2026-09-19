import '../models/booking.dart';
import '../utils/constants.dart';

class BookingPolicy {
  const BookingPolicy({this.transportFeeRwf = AppConstants.transportFeeRwf});

  final int transportFeeRwf;

  static const List<BookingStatus> demoProgression = [
    BookingStatus.confirmed,
    BookingStatus.enRoute,
    BookingStatus.arrived,
    BookingStatus.inProgress,
    BookingStatus.completed,
  ];

  bool canAdvance(BookingStatus status) {
    final index = demoProgression.indexOf(status);
    return index != -1 && index < demoProgression.length - 1;
  }

  BookingStatus? nextStatus(BookingStatus status) {
    if (!canAdvance(status)) {
      return null;
    }
    return demoProgression[demoProgression.indexOf(status) + 1];
  }

  bool canTransition({
    required BookingStatus from,
    required BookingStatus to,
  }) {
    if (from == BookingStatus.cancelled || from == BookingStatus.completed) {
      return false;
    }
    if (to == BookingStatus.cancelled) {
      return canCancel(from);
    }
    return nextStatus(from) == to;
  }

  bool canCancel(BookingStatus status) {
    switch (status) {
      case BookingStatus.pending:
      case BookingStatus.confirmed:
      case BookingStatus.enRoute:
      case BookingStatus.arrived:
        return true;
      case BookingStatus.inProgress:
      case BookingStatus.completed:
      case BookingStatus.cancelled:
        return false;
    }
  }

  RefundResult calculateRefund({
    required BookingStatus status,
    required int amountRwf,
  }) {
    if (!canCancel(status)) {
      final reason = status == BookingStatus.inProgress
          ? 'Cancellation is not allowed after the job has started.'
          : status == BookingStatus.completed
              ? 'Completed bookings cannot be cancelled.'
              : 'This booking can no longer be cancelled.';
      return RefundResult(
        allowed: false,
        refundAmountRwf: 0,
        feeChargedRwf: 0,
        message: reason,
      );
    }

    if (status == BookingStatus.pending || status == BookingStatus.confirmed) {
      return RefundResult(
        allowed: true,
        refundAmountRwf: amountRwf,
        feeChargedRwf: 0,
        message: 'Full refund. The professional has not started the journey.',
      );
    }

    final fee = amountRwf < transportFeeRwf ? amountRwf : transportFeeRwf;
    return RefundResult(
      allowed: true,
      refundAmountRwf: amountRwf - fee,
      feeChargedRwf: fee,
      message:
          'A $transportFeeRwf RWF transport fee is charged because the professional is already ${status.label}. The remaining amount is refunded.',
    );
  }
}

class BookingException implements Exception {
  BookingException(this.message);
  final String message;

  @override
  String toString() => message;
}
