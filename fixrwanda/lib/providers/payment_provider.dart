import 'package:flutter/foundation.dart';

import '../models/payment.dart';
import '../services/payment_service.dart';

class PaymentProvider extends ChangeNotifier {
  PaymentProvider({required this._paymentService});

  final PaymentService _paymentService;

  PaymentMethod _method = PaymentMethod.mtnMomo;
  bool _loading = false;
  String? _error;
  PaymentResult? _lastResult;

  PaymentMethod get method => _method;
  bool get isLoading => _loading;
  String? get error => _error;
  PaymentResult? get lastResult => _lastResult;

  void selectMethod(PaymentMethod method) {
    _method = method;
    _error = null;
    notifyListeners();
  }

  void clear() {
    _error = null;
    _lastResult = null;
    _loading = false;
    notifyListeners();
  }

  Future<PaymentResult> pay({
    required int amountRwf,
    required PaymentRequest request,
  }) async {
    _loading = true;
    _error = null;
    _lastResult = null;
    notifyListeners();
    try {
      final result = await _paymentService.process(
        method: _method,
        amountRwf: amountRwf,
        request: request,
      );
      _lastResult = result;
      if (!result.isSuccess) {
        _error = result.failureReason ?? 'Payment failed.';
      }
      return result;
    } catch (error) {
      _error = error.toString();
      rethrow;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }
}
