enum PaymentMethod { mtnMomo, airtelMoney, card }

enum PaymentStatus { pending, success, failed }

extension PaymentMethodX on PaymentMethod {
  String get apiValue {
    switch (this) {
      case PaymentMethod.mtnMomo:
        return 'mtn_momo';
      case PaymentMethod.airtelMoney:
        return 'airtel_money';
      case PaymentMethod.card:
        return 'card';
    }
  }

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

  String get description {
    switch (this) {
      case PaymentMethod.mtnMomo:
        return 'Mock MTN Mobile Money checkout';
      case PaymentMethod.airtelMoney:
        return 'Mock Airtel Money checkout';
      case PaymentMethod.card:
        return 'Mock Visa / Mastercard checkout';
    }
  }
}

extension PaymentStatusX on PaymentStatus {
  String get apiValue {
    switch (this) {
      case PaymentStatus.pending:
        return 'pending';
      case PaymentStatus.success:
        return 'success';
      case PaymentStatus.failed:
        return 'failed';
    }
  }

  String get label {
    switch (this) {
      case PaymentStatus.pending:
        return 'Pending';
      case PaymentStatus.success:
        return 'Paid';
      case PaymentStatus.failed:
        return 'Failed';
    }
  }
}

class PaymentRequest {
  const PaymentRequest({
    this.phone,
    this.cardNumber,
    this.cardHolder,
    this.cardExpiry,
    this.cardCvv,
  });

  final String? phone;
  final String? cardNumber;
  final String? cardHolder;
  final String? cardExpiry;
  final String? cardCvv;
}

class PaymentResult {
  const PaymentResult({
    required this.id,
    required this.method,
    required this.status,
    required this.amountRwf,
    required this.createdAt,
    this.reference,
    this.failureReason,
  });

  final String id;
  final PaymentMethod method;
  final PaymentStatus status;
  final int amountRwf;
  final DateTime createdAt;
  final String? reference;
  final String? failureReason;

  bool get isSuccess => status == PaymentStatus.success;
}
