import '../models/booking.dart';

abstract class BookingRepository {
  Future<List<Booking>> getForCustomer(String customerId);

  Future<Booking?> getById(String id);

  Future<Booking> create(Booking booking);

  Future<Booking> update(Booking booking);
}
