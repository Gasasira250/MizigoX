enum BookingStatus {
  confirmed,
  enRoute,
  arrived,
  inProgress,
  completed,
  cancelled,
}

enum PaymentMethod { mtnMomo, airtelMoney, card }

class BookingDraft {
  const BookingDraft({
    required this.professionalId,
    required this.professionalName,
    required this.trade,
    required this.service,
    required this.scheduledAt,
    required this.location,
    required this.description,
    required this.serviceFeeRwf,
  });

  final String professionalId;
  final String professionalName;
  final String trade;
  final String service;
  final DateTime scheduledAt;
  final String location;
  final String description;
  final int serviceFeeRwf;
}

class CancellationQuote {
  const CancellationQuote({
    required this.canCancel,
    required this.cancellationFeeRwf,
    required this.refundAmountRwf,
    required this.title,
    required this.message,
  });

  final bool canCancel;
  final int cancellationFeeRwf;
  final int refundAmountRwf;
  final String title;
  final String message;
}

class Booking {
  const Booking({
    required this.id,
    required this.professionalId,
    required this.professionalName,
    required this.trade,
    required this.service,
    required this.scheduledAt,
    required this.location,
    required this.description,
    required this.serviceFeeRwf,
    required this.status,
    required this.paymentMethod,
    required this.paid,
    required this.createdAt,
    this.cancellationFeeRwf,
    this.refundAmountRwf,
    this.cancelledAt,
  });

  final String id;
  final String professionalId;
  final String professionalName;
  final String trade;
  final String service;
  final DateTime scheduledAt;
  final String location;
  final String description;
  final int serviceFeeRwf;
  final BookingStatus status;
  final PaymentMethod paymentMethod;
  final bool paid;
  final DateTime createdAt;
  final int? cancellationFeeRwf;
  final int? refundAmountRwf;
  final DateTime? cancelledAt;

  bool get isUpcoming =>
      status == BookingStatus.confirmed ||
      status == BookingStatus.enRoute ||
      status == BookingStatus.arrived ||
      status == BookingStatus.inProgress;

  bool get isPast =>
      status == BookingStatus.completed || status == BookingStatus.cancelled;

  String get statusLabel {
    switch (status) {
      case BookingStatus.confirmed:
        return 'CONFIRMED';
      case BookingStatus.enRoute:
        return 'EN ROUTE';
      case BookingStatus.arrived:
        return 'ARRIVED';
      case BookingStatus.inProgress:
        return 'IN PROGRESS';
      case BookingStatus.completed:
        return 'COMPLETED';
      case BookingStatus.cancelled:
        return 'CANCELLED';
    }
  }

  Booking copyWith({
    BookingStatus? status,
    int? cancellationFeeRwf,
    int? refundAmountRwf,
    DateTime? cancelledAt,
  }) {
    return Booking(
      id: id,
      professionalId: professionalId,
      professionalName: professionalName,
      trade: trade,
      service: service,
      scheduledAt: scheduledAt,
      location: location,
      description: description,
      serviceFeeRwf: serviceFeeRwf,
      status: status ?? this.status,
      paymentMethod: paymentMethod,
      paid: paid,
      createdAt: createdAt,
      cancellationFeeRwf: cancellationFeeRwf ?? this.cancellationFeeRwf,
      refundAmountRwf: refundAmountRwf ?? this.refundAmountRwf,
      cancelledAt: cancelledAt ?? this.cancelledAt,
    );
  }
}

extension PaymentMethodLabel on PaymentMethod {
  String get label {
    switch (this) {
      case PaymentMethod.mtnMomo:
        return 'MTN MoMo';
      case PaymentMethod.airtelMoney:
        return 'Airtel Money';
      case PaymentMethod.card:
        return 'Card';
    }
  }
}
