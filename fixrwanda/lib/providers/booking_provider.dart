import 'package:flutter/foundation.dart';

import '../models/booking.dart';
import '../models/payment.dart';
import '../services/booking_manager.dart';
import '../services/booking_service.dart';

class BookingProvider extends ChangeNotifier {
  BookingProvider({required this._manager});

  final BookingManager _manager;

  List<Booking> _bookings = [];
  BookingDraft? _draft;
  bool _loading = false;
  String? _error;

  List<Booking> get bookings => _bookings;
  BookingDraft? get draft => _draft;
  bool get isLoading => _loading;
  String? get error => _error;

  Booking? byId(String id) {
    try {
      return _bookings.firstWhere((item) => item.id == id);
    } catch (_) {
      return null;
    }
  }

  Future<void> refresh(String customerId) async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _bookings = await _manager.bookingsFor(customerId);
    } catch (error) {
      _error = 'Unable to load bookings.';
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  void startDraft(BookingDraft draft) {
    _draft = draft;
    notifyListeners();
  }

  void clearDraft() {
    _draft = null;
    notifyListeners();
  }

  Future<Booking> createPending(String customerId) async {
    final draft = _draft;
    if (draft == null) {
      throw BookingException('No booking details to submit.');
    }
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final booking = await _manager.createPending(
        customerId: customerId,
        draft: draft,
      );
      _bookings = [booking, ..._bookings.where((item) => item.id != booking.id)];
      return booking;
    } catch (error) {
      _error = error.toString();
      rethrow;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<Booking> applyPayment(Booking booking, PaymentResult payment) async {
    final updated = await _manager.attachPayment(booking: booking, payment: payment);
    _replace(updated);
    if (payment.isSuccess) {
      _draft = null;
    }
    notifyListeners();
    return updated;
  }

  Future<Booking> advance(Booking booking) async {
    final updated = await _manager.advanceDemoStatus(booking);
    _replace(updated);
    notifyListeners();
    return updated;
  }

  RefundResult previewRefund(Booking booking) => _manager.previewRefund(booking);

  bool canCancel(Booking booking) => _manager.policy.canCancel(booking.status);

  bool canAdvance(Booking booking) => _manager.policy.canAdvance(booking.status);

  Future<Booking> cancel(Booking booking) async {
    final updated = await _manager.cancel(booking);
    _replace(updated);
    notifyListeners();
    return updated;
  }

  void _replace(Booking booking) {
    _bookings = [
      booking,
      ..._bookings.where((item) => item.id != booking.id),
    ];
  }
}
