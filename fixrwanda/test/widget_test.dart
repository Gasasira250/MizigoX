import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:fixrwanda/main.dart';
import 'package:fixrwanda/providers/auth_provider.dart';
import 'package:fixrwanda/providers/booking_provider.dart';
import 'package:fixrwanda/providers/payment_provider.dart';
import 'package:fixrwanda/providers/professional_provider.dart';
import 'package:fixrwanda/repositories/mock_auth_repository.dart';
import 'package:fixrwanda/repositories/mock_booking_repository.dart';
import 'package:fixrwanda/repositories/mock_professional_repository.dart';
import 'package:fixrwanda/screens/login_screen.dart';
import 'package:fixrwanda/services/booking_manager.dart';
import 'package:fixrwanda/services/payment_service.dart';
import 'package:fixrwanda/utils/constants.dart';

AppDependencies testDependencies() {
  return AppDependencies(
    auth: AuthProvider(authRepository: MockAuthRepository(delay: Duration.zero)),
    professionals: ProfessionalProvider(
      repository: MockProfessionalRepository(delay: Duration.zero),
    ),
    bookings: BookingProvider(
      manager: BookingManager(bookingRepository: MockBookingRepository(delay: Duration.zero)),
    ),
    payments: PaymentProvider(paymentService: PaymentService()),
  );
}

Future<void> pumpPastSplash(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(AppConstants.splashDelay);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('login screen validates empty credentials', (tester) async {
    await tester.pumpWidget(FixRwandaApp(dependencies: testDependencies()));
    await pumpPastSplash(tester);

    expect(find.byType(LoginScreen), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).at(0), '');
    await tester.enterText(find.byType(TextFormField).at(1), '');
    await tester.tap(find.text('Log in'));
    await tester.pump();

    expect(find.text('Enter your email address'), findsOneWidget);
    expect(find.text('Enter your password'), findsOneWidget);
  });

  testWidgets('demo account can log in from the login screen', (tester) async {
    await tester.pumpWidget(FixRwandaApp(dependencies: testDependencies()));
    await pumpPastSplash(tester);
    await tester.enterText(find.byType(TextFormField).at(0), AppConstants.demoEmail);
    await tester.enterText(find.byType(TextFormField).at(1), AppConstants.demoPassword);
    await tester.tap(find.text('Log in'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Hello, Jean'), findsOneWidget);
  });
}
