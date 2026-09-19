import 'package:intl/intl.dart';

String formatRwf(int amount) {
  final digits = amount.abs().toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) {
      buffer.write(',');
    }
    buffer.write(digits[i]);
  }
  final sign = amount < 0 ? '-' : '';
  return '$sign$buffer RWF';
}

String formatLongDate(DateTime date) {
  return DateFormat('d MMMM y').format(date);
}

String formatShortDate(DateTime date) {
  return DateFormat('d MMM').format(date);
}

String formatTime(DateTime date) {
  return DateFormat('h:mm a').format(date);
}

String formatDateTime(DateTime date) {
  return '${formatShortDate(date)} • ${formatTime(date)}';
}
