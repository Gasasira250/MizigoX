import '../data/mock_data.dart';
import '../models/user.dart';
import '../utils/constants.dart';
import 'auth_repository.dart';

class MockAuthRepository implements AuthRepository {
  MockAuthRepository({this.delay = AppConstants.mockNetworkDelay});

  final Duration delay;
  final Map<String, String> _passwords = {
    AppConstants.demoEmail.toLowerCase(): AppConstants.demoPassword,
  };
  final Map<String, UserAccount> _users = {
    AppConstants.demoEmail.toLowerCase(): MockData.demoCustomer,
  };
  UserAccount? _currentUser;

  Future<void> _wait() => Future<void>.delayed(delay);

  @override
  Future<UserAccount> login({
    required String email,
    required String password,
  }) async {
    await _wait();
    final key = email.trim().toLowerCase();
    final user = _users[key];
    if (user == null || _passwords[key] != password) {
      throw AuthException('Incorrect email or password');
    }
    _currentUser = user;
    return user;
  }

  @override
  Future<UserAccount> register({
    required String fullName,
    required String email,
    required String phone,
    required String address,
    required String password,
  }) async {
    await _wait();
    final key = email.trim().toLowerCase();
    if (_users.containsKey(key)) {
      throw AuthException('An account with this email already exists');
    }
    final user = UserAccount(
      id: 'usr_${DateTime.now().millisecondsSinceEpoch}',
      fullName: fullName.trim(),
      email: key,
      phone: phone.trim(),
      address: address.trim(),
    );
    _users[key] = user;
    _passwords[key] = password;
    _currentUser = user;
    return user;
  }

  @override
  Future<void> logout() async {
    _currentUser = null;
  }

  @override
  UserAccount? currentUser() => _currentUser;
}
