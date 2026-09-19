import '../models/professional.dart';
import '../models/service.dart';

abstract class ProfessionalRepository {
  Future<List<ServiceCategory>> getCategories();

  Future<List<Professional>> getProfessionals({
    String? categoryId,
    String? query,
  });

  Future<Professional?> getById(String id);
}
