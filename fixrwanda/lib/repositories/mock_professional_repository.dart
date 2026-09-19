import '../data/mock_data.dart';
import '../models/professional.dart';
import '../models/service.dart';
import '../utils/constants.dart';
import 'professional_repository.dart';

class MockProfessionalRepository implements ProfessionalRepository {
  MockProfessionalRepository({this.delay = AppConstants.mockNetworkDelay});

  final Duration delay;

  Future<void> _wait() => Future<void>.delayed(delay);

  @override
  Future<List<ServiceCategory>> getCategories() async {
    await _wait();
    return List<ServiceCategory>.from(MockData.categories);
  }

  @override
  Future<List<Professional>> getProfessionals({
    String? categoryId,
    String? query,
  }) async {
    await _wait();
    final needle = query?.trim().toLowerCase() ?? '';
    return MockData.professionals.where((professional) {
      final matchesCategory =
          categoryId == null || professional.serviceCategoryId == categoryId;
      final haystack =
          '${professional.name} ${professional.location} ${professional.description} ${professional.specialty}'
              .toLowerCase();
      final matchesQuery = needle.isEmpty || haystack.contains(needle);
      return matchesCategory && matchesQuery;
    }).toList();
  }

  @override
  Future<Professional?> getById(String id) async {
    await _wait();
    try {
      return MockData.professionals.firstWhere((item) => item.id == id);
    } catch (_) {
      return null;
    }
  }
}
