import 'package:flutter_test/flutter_test.dart';
import 'package:fixrwanda/models/payment.dart';
import 'package:fixrwanda/services/payment_service.dart';

void main() {
  late PaymentService service;

  setUp(() {
    service = PaymentService(
      gateways: {
        PaymentMethod.mtnMomo: MockMtnMoMoGateway(delay: Duration.zero),
        PaymentMethod.airtelMoney: MockAirtelMoneyGateway(delay: Duration.zero),
        PaymentMethod.card: MockCardGateway(delay: Duration.zero),
      },
    );
  });

  test('mock MTN MoMo succeeds for a normal Rwandan number', () async {
    final result = await service.process(
      method: PaymentMethod.mtnMomo,
      amountRwf: 25000,
      request: const PaymentRequest(phone: '0788001122'),
    );
    expect(result.status, PaymentStatus.success);
    expect(result.reference, isNotNull);
  });

  test('mock MTN MoMo fails when the number ends with 000', () async {
    final result = await service.process(
      method: PaymentMethod.mtnMomo,
      amountRwf: 25000,
      request: const PaymentRequest(phone: '0788001000'),
    );
    expect(result.status, PaymentStatus.failed);
    expect(result.failureReason, contains('Mock MTN MoMo'));
  });

  test('mock Airtel Money succeeds and fails with the same demo rule', () async {
    final success = await service.process(
      method: PaymentMethod.airtelMoney,
      amountRwf: 18000,
      request: const PaymentRequest(phone: '0728001122'),
    );
    expect(success.status, PaymentStatus.success);

    final failed = await service.process(
      method: PaymentMethod.airtelMoney,
      amountRwf: 18000,
      request: const PaymentRequest(phone: '0728001000'),
    );
    expect(failed.status, PaymentStatus.failed);
  });

  test('mock card payment succeeds unless the card ends with 0000', () async {
    final success = await service.process(
      method: PaymentMethod.card,
      amountRwf: 40000,
      request: const PaymentRequest(
        cardNumber: '4111111111111111',
        cardHolder: 'Jean Uwase',
        cardExpiry: '12/28',
        cardCvv: '123',
      ),
    );
    expect(success.status, PaymentStatus.success);

    final failed = await service.process(
      method: PaymentMethod.card,
      amountRwf: 40000,
      request: const PaymentRequest(
        cardNumber: '4111111111110000',
        cardHolder: 'Jean Uwase',
        cardExpiry: '12/28',
        cardCvv: '123',
      ),
    );
    expect(failed.status, PaymentStatus.failed);
  });
}
