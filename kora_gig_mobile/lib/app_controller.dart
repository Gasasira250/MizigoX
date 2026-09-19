import 'package:flutter/material.dart';

import 'models/booking.dart';
import 'models/professional.dart';
import 'services/api_service.dart';
import 'services/booking_service.dart';

class KoraGigScope extends InheritedNotifier<AppController> {
  const KoraGigScope({
    super.key,
    required AppController controller,
    required super.child,
  }) : super(notifier: controller);

  static AppController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<KoraGigScope>();
    assert(scope != null, 'KoraGigScope not found');
    return scope!.notifier!;
  }
}

class AppController extends ChangeNotifier {
  AppController({ApiService? api, BookingService? bookings})
    : api = api ?? ApiService(),
      bookings = bookings ?? BookingService();

  final ApiService api;
  final BookingService bookings;

  Customer? customer;
  bool busy = false;
  String? error;

  bool get isSignedIn => customer != null;

  Future<bool> signIn({
    required String identifier,
    required String password,
  }) async {
    return _run(() async {
      customer = await api.login(identifier: identifier, password: password);
    });
  }

  Future<bool> signInDemo() {
    return signIn(identifier: 'hannington@koragig.rw', password: 'demo123');
  }

  Future<bool> createAccount({
    required String name,
    required String identifier,
    required String password,
  }) async {
    return _run(() async {
      customer = await api.register(
        name: name,
        identifier: identifier,
        password: password,
      );
    });
  }

  void signOut() {
    customer = null;
    notifyListeners();
  }

  Booking payAndConfirm({
    required BookingDraft draft,
    required PaymentMethod method,
  }) {
    final booking = bookings.confirmPayment(draft: draft, method: method);
    notifyListeners();
    return booking;
  }

  CancellationQuote quoteCancellation(Booking booking) {
    return bookings.quoteCancellation(booking);
  }

  Booking cancelBooking(String bookingId) {
    final cancelled = bookings.cancel(bookingId);
    notifyListeners();
    return cancelled;
  }

  Booking simulateProfessionalAction(String bookingId) {
    final updated = bookings.nextProfessionalAction(bookingId);
    notifyListeners();
    return updated;
  }

  Future<bool> _run(Future<void> Function() action) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      await action();
      busy = false;
      notifyListeners();
      return true;
    } catch (err) {
      busy = false;
      error = err.toString();
      notifyListeners();
      return false;
    }
  }
}
