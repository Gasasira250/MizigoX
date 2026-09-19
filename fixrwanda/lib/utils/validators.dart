class Validators {
  static final RegExp _email = RegExp(r'^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$');
  static final RegExp _rwandaMobile = RegExp(r'^(07[2-9]\d{7}|2507[2-9]\d{7})$');

  static String? email(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) {
      return 'Enter your email address';
    }
    if (!_email.hasMatch(text)) {
      return 'Enter a valid email address';
    }
    return null;
  }

  static String? password(String? value) {
    final text = value ?? '';
    if (text.isEmpty) {
      return 'Enter your password';
    }
    if (text.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (!RegExp(r'[A-Z]').hasMatch(text)) {
      return 'Password must include an uppercase letter';
    }
    if (!RegExp(r'[0-9]').hasMatch(text)) {
      return 'Password must include a number';
    }
    return null;
  }

  static String? confirmPassword(String? value, String original) {
    if (value == null || value.isEmpty) {
      return 'Confirm your password';
    }
    if (value != original) {
      return 'Passwords do not match';
    }
    return null;
  }

  static String? fullName(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) {
      return 'Enter your full name';
    }
    if (text.length < 3) {
      return 'Enter at least 3 characters';
    }
    if (!text.contains(' ')) {
      return 'Enter your first and last name';
    }
    return null;
  }

  static String? rwandaPhone(String? value) {
    final text = (value ?? '').replaceAll(' ', '');
    if (text.isEmpty) {
      return 'Enter your mobile number';
    }
    if (!_rwandaMobile.hasMatch(text)) {
      return 'Enter a valid Rwandan mobile number';
    }
    return null;
  }

  static String? requiredField(String? value, String label) {
    if (value == null || value.trim().isEmpty) {
      return 'Enter $label';
    }
    return null;
  }

  static String? address(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) {
      return 'Enter the service address';
    }
    if (text.length < 8) {
      return 'Enter a more complete Kigali address';
    }
    return null;
  }

  static String? cardNumber(String? value) {
    final digits = (value ?? '').replaceAll(RegExp(r'\s'), '');
    if (digits.isEmpty) {
      return 'Enter the card number';
    }
    if (digits.length < 16 || digits.length > 19 || int.tryParse(digits) == null) {
      return 'Enter a valid card number';
    }
    return null;
  }

  static String? cardExpiry(String? value) {
    final text = (value ?? '').trim();
    if (!RegExp(r'^\d{2}/\d{2}$').hasMatch(text)) {
      return 'Use MM/YY';
    }
    final month = int.parse(text.split('/').first);
    if (month < 1 || month > 12) {
      return 'Enter a valid month';
    }
    return null;
  }

  static String? cardCvv(String? value) {
    final text = (value ?? '').trim();
    if (!RegExp(r'^\d{3,4}$').hasMatch(text)) {
      return 'Enter a valid CVV';
    }
    return null;
  }
}
