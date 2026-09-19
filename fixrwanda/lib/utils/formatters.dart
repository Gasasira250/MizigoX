import 'package:intl/intl.dart';

import 'constants.dart';

class Formatters {
  static final NumberFormat _amount = NumberFormat.decimalPattern('en_US');
  static final DateFormat _date = DateFormat('EEE, d MMM yyyy');
  static final DateFormat _time = DateFormat('HH:mm');
  static final DateFormat _dateTime = DateFormat('EEE, d MMM yyyy • HH:mm');

  static String rwf(int amount) => '${_amount.format(amount)} ${AppConstants.currencyCode}';

  static String date(DateTime value) => _date.format(value);

  static String time(DateTime value) => _time.format(value);

  static String dateTime(DateTime value) => _dateTime.format(value);

  static String phoneHint(String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 4) {
      return raw;
    }
    return '***${digits.substring(digits.length - 4)}';
  }
}
