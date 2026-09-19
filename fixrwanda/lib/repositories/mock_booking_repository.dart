import '../models/booking.dart';
import '../utils/constants.dart';
import 'booking_repository.dart';

class MockBookingRepository implements BookingRepository {
  MockBookingRepository({this.delay = AppConstants.mockNetworkDelay});

  final Duration delay;
  final Map<String, Booking> _bookings = {};

  Future<void> _wait() => Future<void>.delayed(delay);

  @override
  Future<List<Booking>> getForCustomer(String customerId) async {
    await _wait();
    final items = _bookings.values
        .where((booking) => booking.customerId == customerId)
        .toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return items;
  }

  @override
  Future<Booking?> getById(String id) async {
    await _wait();
    return _bookings[id];
  }

  @override
  Future<Booking> create(Booking booking) async {
    await _wait();
    _bookings[booking.id] = booking;
    return booking;
  }

  @override
  Future<Booking> update(Booking booking) async {
    await _wait();
    _bookings[booking.id] = booking;
    return booking;
  }
}
