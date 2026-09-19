import 'package:flutter/foundation.dart';

import '../models/professional.dart';
import '../models/service.dart';
import '../repositories/professional_repository.dart';

class ProfessionalProvider extends ChangeNotifier {
  ProfessionalProvider({required this._repository});

  final ProfessionalRepository _repository;

  List<ServiceCategory> _categories = [];
  List<Professional> _professionals = [];
  bool _loading = false;
  String? _error;
  String _query = '';
  String? _categoryId;

  List<ServiceCategory> get categories => _categories;
  List<Professional> get professionals => _professionals;
  bool get isLoading => _loading;
  String? get error => _error;
  String get query => _query;
  String? get selectedCategoryId => _categoryId;

  List<Professional> get featured {
    final verified = _professionals
        .where((item) => item.verification.isFullyVerified)
        .toList()
      ..sort((a, b) => b.rating.compareTo(a.rating));
    return verified.take(4).toList();
  }

  ServiceCategory? categoryById(String id) {
    try {
      return _categories.firstWhere((item) => item.id == id);
    } catch (_) {
      return null;
    }
  }

  Professional? professionalById(String id) {
    try {
      return _professionals.firstWhere((item) => item.id == id);
    } catch (_) {
      return null;
    }
  }

  Future<void> loadCatalog() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _categories = await _repository.getCategories();
      _professionals = await _repository.getProfessionals();
    } catch (error) {
      _error = 'Unable to load services. Pull to refresh and try again.';
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> search({String? query, String? categoryId}) async {
    _query = query ?? _query;
    _categoryId = categoryId;
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _professionals = await _repository.getProfessionals(
        query: _query,
        categoryId: _categoryId,
      );
    } catch (error) {
      _error = 'Search failed. Check your connection and try again.';
    } finally {
      _loading = false;
      notifyListeners();
    }
  }
}
