import '../models/user.dart';

class AuthException implements Exception {
  AuthException(this.message);
  final String message;

  @override
  String toString() => message;
}

abstract class AuthRepository {
  Future<UserAccount> login({required String email, required String password});

  Future<UserAccount> register({
    required String fullName,
    required String email,
    required String phone,
    required String address,
    required String password,
  });

  Future<void> logout();

  UserAccount? currentUser();
}
