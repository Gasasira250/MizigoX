import 'package:flutter/foundation.dart';

import '../models/user.dart';
import '../repositories/auth_repository.dart';

class AuthProvider extends ChangeNotifier {
  AuthProvider({required this._authRepository});

  final AuthRepository _authRepository;

  UserAccount? _user;
  bool _loading = false;
  String? _error;

  UserAccount? get user => _user;
  bool get isLoggedIn => _user != null;
  bool get isLoading => _loading;
  String? get error => _error;

  Future<bool> login({required String email, required String password}) {
    return _run(() => _authRepository.login(email: email, password: password));
  }

  Future<bool> register({
    required String fullName,
    required String email,
    required String phone,
    required String address,
    required String password,
  }) {
    return _run(
      () => _authRepository.register(
        fullName: fullName,
        email: email,
        phone: phone,
        address: address,
        password: password,
      ),
    );
  }

  Future<void> logout() async {
    await _authRepository.logout();
    _user = null;
    _error = null;
    notifyListeners();
  }

  void updateProfile({String? fullName, String? phone, String? address}) {
    if (_user == null) {
      return;
    }
    _user = _user!.copyWith(fullName: fullName, phone: phone, address: address);
    notifyListeners();
  }

  void clearError() {
    if (_error == null) {
      return;
    }
    _error = null;
    notifyListeners();
  }

  Future<bool> _run(Future<UserAccount> Function() action) async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _user = await action();
      return true;
    } catch (error) {
      _error = error.toString();
      return false;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }
}
