import 'payment.dart';

enum BookingStatus {
  pending,
  confirmed,
  enRoute,
  arrived,
  inProgress,
  completed,
  cancelled,
}

extension BookingStatusX on BookingStatus {
  String get apiValue {
    switch (this) {
      case BookingStatus.pending:
        return 'pending';
      case BookingStatus.confirmed:
        return 'confirmed';
      case BookingStatus.enRoute:
        return 'en_route';
      case BookingStatus.arrived:
        return 'arrived';
      case BookingStatus.inProgress:
        return 'in_progress';
      case BookingStatus.completed:
        return 'completed';
      case BookingStatus.cancelled:
        return 'cancelled';
    }
  }

  String get label {
    switch (this) {
      case BookingStatus.pending:
        return 'Pending payment';
      case BookingStatus.confirmed:
        return 'Confirmed';
      case BookingStatus.enRoute:
        return 'On the way';
      case BookingStatus.arrived:
        return 'Arrived';
      case BookingStatus.inProgress:
        return 'In progress';
      case BookingStatus.completed:
        return 'Completed';
      case BookingStatus.cancelled:
        return 'Cancelled';
    }
  }

  static BookingStatus fromApi(String value) {
    return BookingStatus.values.firstWhere(
      (item) => item.apiValue == value,
      orElse: () => BookingStatus.pending,
    );
  }
}

class BookingDraft {
  const BookingDraft({
    required this.professionalId,
    required this.serviceCategoryId,
    required this.scheduledAt,
    required this.address,
    required this.amountRwf,
    this.notes = '',
  });

  final String professionalId;
  final String serviceCategoryId;
  final DateTime scheduledAt;
  final String address;
  final String notes;
  final int amountRwf;
}

class RefundResult {
  const RefundResult({
    required this.allowed,
    required this.refundAmountRwf,
    required this.feeChargedRwf,
    required this.message,
  });

  final bool allowed;
  final int refundAmountRwf;
  final int feeChargedRwf;
  final String message;
}

class Booking {
  const Booking({
    required this.id,
    required this.customerId,
    required this.professionalId,
    required this.serviceCategoryId,
    required this.scheduledAt,
    required this.address,
    required this.amountRwf,
    required this.status,
    required this.createdAt,
    this.notes = '',
    this.payment,
    this.cancelledAt,
    this.refundAmountRwf,
    this.cancellationReason,
  });

  final String id;
  final String customerId;
  final String professionalId;
  final String serviceCategoryId;
  final DateTime scheduledAt;
  final String address;
  final String notes;
  final int amountRwf;
  final BookingStatus status;
  final PaymentResult? payment;
  final DateTime createdAt;
  final DateTime? cancelledAt;
  final int? refundAmountRwf;
  final String? cancellationReason;

  Booking copyWith({
    BookingStatus? status,
    PaymentResult? payment,
    DateTime? cancelledAt,
    int? refundAmountRwf,
    String? cancellationReason,
  }) {
    return Booking(
      id: id,
      customerId: customerId,
      professionalId: professionalId,
      serviceCategoryId: serviceCategoryId,
      scheduledAt: scheduledAt,
      address: address,
      notes: notes,
      amountRwf: amountRwf,
      status: status ?? this.status,
      createdAt: createdAt,
      payment: payment ?? this.payment,
      cancelledAt: cancelledAt ?? this.cancelledAt,
      refundAmountRwf: refundAmountRwf ?? this.refundAmountRwf,
      cancellationReason: cancellationReason ?? this.cancellationReason,
    );
  }
}
