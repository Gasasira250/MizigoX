import '../models/professional.dart';

/// Client-side API façade.
///
/// Today this returns in-memory demo data so the interview flow can run
/// without a live backend. The production shape is the same:
///
///   Flutter app  →  REST API  →  PostgreSQL
///                             →  Payment API (MTN / Airtel / Card)
///
/// Verification is never decided in Flutter. The API would return fields such
/// as `tvetVerified`, `idVerified`, and `verificationStatus` after an
/// authorized backend process (TVET certificate + government ID checks).
class ApiService {
  Future<Customer> login({
    required String identifier,
    required String password,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (identifier.trim().isEmpty || password.trim().length < 4) {
      throw AuthException(
        'Enter a phone number or email and a password of at least 4 characters.',
      );
    }
    return Customer(
      id: 'cus-hannington',
      name: _displayNameFor(identifier),
      identifier: identifier.trim(),
    );
  }

  Future<Customer> register({
    required String name,
    required String identifier,
    required String password,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (name.trim().isEmpty ||
        identifier.trim().isEmpty ||
        password.trim().length < 4) {
      throw AuthException('Please complete all fields to create an account.');
    }
    return Customer(
      id: 'cus-${identifier.hashCode}',
      name: name.trim(),
      identifier: identifier.trim(),
    );
  }

  Future<List<ServiceCategory>> fetchCategories() async {
    return const [
      ServiceCategory(id: 'electrician', name: 'Electrician', icon: '⚡'),
      ServiceCategory(id: 'plumber', name: 'Plumber', icon: '🔧'),
      ServiceCategory(id: 'cleaner', name: 'Cleaner', icon: '🧹'),
      ServiceCategory(id: 'stylist', name: 'Stylist', icon: '💇'),
    ];
  }

  Future<List<Professional>> fetchProfessionals({
    String? trade,
    String? query,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 200));
    final needle = query?.trim().toLowerCase() ?? '';
    return _professionals.where((professional) {
      final tradeOk =
          trade == null ||
          trade.isEmpty ||
          professional.trade.toLowerCase() == trade.toLowerCase();
      final queryOk =
          needle.isEmpty ||
          professional.name.toLowerCase().contains(needle) ||
          professional.trade.toLowerCase().contains(needle) ||
          professional.services.any(
            (service) => service.toLowerCase().contains(needle),
          ) ||
          professional.location.toLowerCase().contains(needle);
      return tradeOk && queryOk;
    }).toList();
  }

  Future<Professional> fetchProfessional(String id) async {
    return _professionals.firstWhere((professional) => professional.id == id);
  }

  static String _displayNameFor(String identifier) {
    final value = identifier.trim().toLowerCase();
    if (value.contains('hannington') ||
        value == '0780000000' ||
        value == 'demo') {
      return 'Hannington';
    }
    if (value.contains('@')) {
      final local = value.split('@').first;
      if (local.isEmpty) return 'Guest';
      return '${local[0].toUpperCase()}${local.substring(1)}';
    }
    return 'Hannington';
  }

  static const _professionals = [
    Professional(
      id: 'pro-john',
      name: 'John Electrical Services',
      trade: 'Electrician',
      location: 'Kigali',
      rating: 4.8,
      jobsCompleted: 126,
      tvetVerified: true,
      idVerified: true,
      verificationStatus: VerificationStatus.verified,
      serviceFeeRwf: 30000,
      services: ['Electrical installation', 'Wiring', 'Repairs'],
      about: 'Licensed electrician for homes and small businesses. Wiring, sockets, lighting and fault-finding.',
    ),
    Professional(
      id: 'pro-sarah',
      name: 'Sarah Cleaning Services',
      trade: 'Cleaner',
      location: 'Kigali',
      rating: 4.9,
      jobsCompleted: 210,
      tvetVerified: true,
      idVerified: true,
      verificationStatus: VerificationStatus.verified,
      serviceFeeRwf: 18000,
      services: ['Home cleaning', 'Office cleaning', 'Deep cleaning'],
    ),
    Professional(
      id: 'pro-david',
      name: 'David Plumbing Co',
      trade: 'Plumber',
      location: 'Kigali',
      rating: 4.6,
      jobsCompleted: 88,
      tvetVerified: true,
      idVerified: false,
      verificationStatus: VerificationStatus.pending,
      serviceFeeRwf: 25000,
      services: ['Leak repair', 'Pipe installation', 'Bathroom fitting'],
    ),
    Professional(
      id: 'pro-amina',
      name: 'Amina Style House',
      trade: 'Stylist',
      location: 'Kigali',
      rating: 4.7,
      jobsCompleted: 64,
      tvetVerified: false,
      idVerified: true,
      verificationStatus: VerificationStatus.verified,
      serviceFeeRwf: 15000,
      services: ['Braiding', 'Haircut', 'Event styling'],
    ),
  ];
}

class AuthException implements Exception {
  AuthException(this.message);
  final String message;

  @override
  String toString() => message;
}
