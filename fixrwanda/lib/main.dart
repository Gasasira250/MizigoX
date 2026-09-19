import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'providers/auth_provider.dart';
import 'providers/booking_provider.dart';
import 'providers/payment_provider.dart';
import 'providers/professional_provider.dart';
import 'repositories/mock_auth_repository.dart';
import 'repositories/mock_booking_repository.dart';
import 'repositories/mock_professional_repository.dart';
import 'screens/booking_detail_screen.dart';
import 'screens/booking_screen.dart';
import 'screens/booking_success_screen.dart';
import 'screens/booking_summary_screen.dart';
import 'screens/login_screen.dart';
import 'screens/main_shell.dart';
import 'screens/payment_screen.dart';
import 'screens/professional_detail_screen.dart';
import 'screens/professionals_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/register_screen.dart';
import 'screens/search_screen.dart';
import 'screens/service_categories_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/splash_screen.dart';
import 'services/booking_manager.dart';
import 'services/payment_service.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(FixRwandaApp(dependencies: AppDependencies.demo()));
}

class AppDependencies {
  AppDependencies({
    required this.auth,
    required this.professionals,
    required this.bookings,
    required this.payments,
  });

  factory AppDependencies.demo() {
    return AppDependencies(
      auth: AuthProvider(authRepository: MockAuthRepository()),
      professionals: ProfessionalProvider(repository: MockProfessionalRepository()),
      bookings: BookingProvider(manager: BookingManager(bookingRepository: MockBookingRepository())),
      payments: PaymentProvider(paymentService: PaymentService()),
    );
  }

  final AuthProvider auth;
  final ProfessionalProvider professionals;
  final BookingProvider bookings;
  final PaymentProvider payments;
}

class FixRwandaApp extends StatelessWidget {
  const FixRwandaApp({super.key, required this.dependencies});

  final AppDependencies dependencies;

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: dependencies.auth),
        ChangeNotifierProvider.value(value: dependencies.professionals),
        ChangeNotifierProvider.value(value: dependencies.bookings),
        ChangeNotifierProvider.value(value: dependencies.payments),
      ],
      child: MaterialApp(
        title: 'FixRwanda',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        initialRoute: SplashScreen.routeName,
        routes: {
          SplashScreen.routeName: (_) => const SplashScreen(),
          LoginScreen.routeName: (_) => const LoginScreen(),
          RegisterScreen.routeName: (_) => const RegisterScreen(),
          MainShell.routeName: (_) => const MainShell(),
          ServiceCategoriesScreen.routeName: (_) => const ServiceCategoriesScreen(),
          SearchScreen.routeName: (_) => const SearchScreen(),
          ProfessionalsScreen.routeName: (_) => const ProfessionalsScreen(),
          ProfessionalDetailScreen.routeName: (_) => const ProfessionalDetailScreen(),
          BookingScreen.routeName: (_) => const BookingScreen(),
          BookingSummaryScreen.routeName: (_) => const BookingSummaryScreen(),
          PaymentScreen.routeName: (_) => const PaymentScreen(),
          BookingSuccessScreen.routeName: (_) => const BookingSuccessScreen(),
          BookingDetailScreen.routeName: (_) => const BookingDetailScreen(),
          ProfileScreen.routeName: (_) => const ProfileScreen(),
          SettingsScreen.routeName: (_) => const SettingsScreen(),
        },
      ),
    );
  }
}
