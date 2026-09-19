class AppConstants {
  static const String appName = 'FixRwanda';
  static const String tagline = 'Home and professional services in Kigali';
  static const String currencyCode = 'RWF';
  static const int transportFeeRwf = 2000;

  static const String demoEmail = 'jean.uwase@fixrwanda.rw';
  static const String demoPassword = 'Password123!';
  static const String demoName = 'Jean Uwase';
  static const String demoPhone = '0788001122';
  static const String demoAddress = 'KN 5 Rd, Kimihurura, Kigali';

  static const String verificationDisclaimer =
      'Verification badges in this demo are mock data for product presentation. '
      'FixRwanda does not perform Rwanda government ID verification.';

  static const String paymentsDisclaimer =
      'MTN MoMo, Airtel Money, and card payments in this version are mock '
      'checkouts. No real money is charged and no live payment APIs are used.';

  static const Duration splashDelay = Duration(milliseconds: 1600);
  static const Duration mockNetworkDelay = Duration(milliseconds: 700);
  static const Duration mockPaymentDelay = Duration(milliseconds: 1200);
}
