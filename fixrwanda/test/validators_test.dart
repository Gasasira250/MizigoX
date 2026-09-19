import 'package:flutter_test/flutter_test.dart';

import 'package:fixrwanda/utils/validators.dart';

void main() {
  group('login validation', () {
    test('rejects empty and invalid emails', () {
      expect(Validators.email(null), isNotNull);
      expect(Validators.email(''), isNotNull);
      expect(Validators.email('jean'), isNotNull);
      expect(Validators.email('jean@kigali'), isNotNull);
    });

    test('accepts a valid email', () {
      expect(Validators.email('jean.uwase@fixrwanda.rw'), isNull);
    });

    test('rejects a weak password', () {
      expect(Validators.password(null), isNotNull);
      expect(Validators.password('short'), isNotNull);
      expect(Validators.password('nouppercase1'), isNotNull);
      expect(Validators.password('NoNumber'), isNotNull);
    });

    test('accepts a strong password', () {
      expect(Validators.password('Password123!'), isNull);
    });
  });

  group('registration validation', () {
    test('requires first and last name', () {
      expect(Validators.fullName('Jean'), isNotNull);
      expect(Validators.fullName('Jean Uwase'), isNull);
    });

    test('requires a Rwandan mobile number', () {
      expect(Validators.rwandaPhone('12345'), isNotNull);
      expect(Validators.rwandaPhone('0788001122'), isNull);
      expect(Validators.rwandaPhone('250788001122'), isNull);
    });

    test('requires a complete address', () {
      expect(Validators.address('Kigali'), isNotNull);
      expect(Validators.address('KN 5 Rd, Kimihurura, Kigali'), isNull);
    });

    test('requires matching passwords', () {
      expect(Validators.confirmPassword('Password123!', 'Password123!'), isNull);
      expect(Validators.confirmPassword('other', 'Password123!'), isNotNull);
    });
  });
}
