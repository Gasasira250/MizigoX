import 'package:uuid/uuid.dart';

import '../models/payment.dart';
import '../utils/constants.dart';
import '../utils/validators.dart';

class PaymentException implements Exception {
  PaymentException(this.message);
  final String message;

  @override
  String toString() => message;
}

abstract class PaymentGateway {
  PaymentMethod get method;

  Future<PaymentResult> charge({
    required int amountRwf,
    required PaymentRequest request,
  });
}

class MockMtnMoMoGateway implements PaymentGateway {
  MockMtnMoMoGateway({this.delay = AppConstants.mockPaymentDelay, Uuid? uuid})
      : _uuid = uuid ?? const Uuid();

  final Duration delay;
  final Uuid _uuid;

  @override
  PaymentMethod get method => PaymentMethod.mtnMomo;

  @override
  Future<PaymentResult> charge({
    required int amountRwf,
    required PaymentRequest request,
  }) async {
    final phoneError = Validators.rwandaPhone(request.phone);
    if (phoneError != null) {
      throw PaymentException(phoneError);
    }
    await Future<void>.delayed(delay);
    return _mockOutcome(
      amountRwf: amountRwf,
      fail: request.phone!.replaceAll(' ', '').endsWith('000'),
      failureReason: 'Mock MTN MoMo payment declined. Numbers ending with 000 fail in this demo.',
    );
  }

  PaymentResult _mockOutcome({
    required int amountRwf,
    required bool fail,
    required String failureReason,
  }) {
    final id = 'pay_${_uuid.v4()}';
    if (fail) {
      return PaymentResult(
        id: id,
        method: method,
        status: PaymentStatus.failed,
        amountRwf: amountRwf,
        createdAt: DateTime.now(),
        failureReason: failureReason,
      );
    }
    return PaymentResult(
      id: id,
      method: method,
      status: PaymentStatus.success,
      amountRwf: amountRwf,
      createdAt: DateTime.now(),
      reference: 'MOMO-${id.substring(4, 12).toUpperCase()}',
    );
  }
}

class MockAirtelMoneyGateway implements PaymentGateway {
  MockAirtelMoneyGateway({this.delay = AppConstants.mockPaymentDelay, Uuid? uuid})
      : _uuid = uuid ?? const Uuid();

  final Duration delay;
  final Uuid _uuid;

  @override
  PaymentMethod get method => PaymentMethod.airtelMoney;

  @override
  Future<PaymentResult> charge({
    required int amountRwf,
    required PaymentRequest request,
  }) async {
    final phoneError = Validators.rwandaPhone(request.phone);
    if (phoneError != null) {
      throw PaymentException(phoneError);
    }
    await Future<void>.delayed(delay);
    final fail = request.phone!.replaceAll(' ', '').endsWith('000');
    final id = 'pay_${_uuid.v4()}';
    if (fail) {
      return PaymentResult(
        id: id,
        method: method,
        status: PaymentStatus.failed,
        amountRwf: amountRwf,
        createdAt: DateTime.now(),
        failureReason:
            'Mock Airtel Money payment declined. Numbers ending with 000 fail in this demo.',
      );
    }
    return PaymentResult(
      id: id,
      method: method,
      status: PaymentStatus.success,
      amountRwf: amountRwf,
      createdAt: DateTime.now(),
      reference: 'AIRTEL-${id.substring(4, 12).toUpperCase()}',
    );
  }
}

class MockCardGateway implements PaymentGateway {
  MockCardGateway({this.delay = AppConstants.mockPaymentDelay, Uuid? uuid})
      : _uuid = uuid ?? const Uuid();

  final Duration delay;
  final Uuid _uuid;

  @override
  PaymentMethod get method => PaymentMethod.card;

  @override
  Future<PaymentResult> charge({
    required int amountRwf,
    required PaymentRequest request,
  }) async {
    final numberError = Validators.cardNumber(request.cardNumber);
    final expiryError = Validators.cardExpiry(request.cardExpiry);
    final cvvError = Validators.cardCvv(request.cardCvv);
    final nameError = Validators.requiredField(request.cardHolder, 'the cardholder name');
    final firstError = numberError ?? expiryError ?? cvvError ?? nameError;
    if (firstError != null) {
      throw PaymentException(firstError);
    }
    await Future<void>.delayed(delay);
    final digits = request.cardNumber!.replaceAll(RegExp(r'\s'), '');
    final fail = digits.endsWith('0000');
    final id = 'pay_${_uuid.v4()}';
    if (fail) {
      return PaymentResult(
        id: id,
        method: method,
        status: PaymentStatus.failed,
        amountRwf: amountRwf,
        createdAt: DateTime.now(),
        failureReason: 'Mock card payment declined. Cards ending with 0000 fail in this demo.',
      );
    }
    return PaymentResult(
      id: id,
      method: method,
      status: PaymentStatus.success,
      amountRwf: amountRwf,
      createdAt: DateTime.now(),
      reference: 'CARD-${id.substring(4, 12).toUpperCase()}',
    );
  }
}

class PaymentService {
  PaymentService({Map<PaymentMethod, PaymentGateway>? gateways})
      : _gateways = gateways ??
            {
              PaymentMethod.mtnMomo: MockMtnMoMoGateway(),
              PaymentMethod.airtelMoney: MockAirtelMoneyGateway(),
              PaymentMethod.card: MockCardGateway(),
            };

  final Map<PaymentMethod, PaymentGateway> _gateways;

  Future<PaymentResult> process({
    required PaymentMethod method,
    required int amountRwf,
    required PaymentRequest request,
  }) {
    final gateway = _gateways[method];
    if (gateway == null) {
      throw PaymentException('No payment gateway configured for ${method.label}');
    }
    return gateway.charge(amountRwf: amountRwf, request: request);
  }
}
