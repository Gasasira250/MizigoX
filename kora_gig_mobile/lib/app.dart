import 'package:flutter/material.dart';

import 'app_controller.dart';
import 'models/booking.dart';
import 'models/professional.dart';
import 'screens/booking_detail_screen.dart';
import 'screens/booking_screen.dart';
import 'screens/booking_success_screen.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/payment_screen.dart';
import 'screens/professional_detail_screen.dart';
import 'screens/professionals_screen.dart';
import 'screens/splash_screen.dart';
import 'theme/app_theme.dart';

class KoraGigApp extends StatelessWidget {
  const KoraGigApp({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return KoraGigScope(
      controller: controller,
      child: MaterialApp(
        title: 'Kora Gig',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        builder: (context, child) {
          return ColoredBox(
            color: AppColors.forestDeep,
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430),
                child: child ?? const SizedBox.shrink(),
              ),
            ),
          );
        },
        initialRoute: '/',
        onGenerateRoute: (settings) {
          final page = switch (settings.name) {
            '/' => const SplashScreen(),
            '/login' => const LoginScreen(),
            '/register' => const RegisterScreen(),
            '/home' => const MainShell(),
            '/professionals' => ProfessionalsScreen(
              args: settings.arguments is ProfessionalsArgs
                  ? settings.arguments as ProfessionalsArgs
                  : const ProfessionalsArgs(),
            ),
            '/professional' => ProfessionalDetailScreen(
              professional: settings.arguments as Professional,
            ),
            '/booking' => BookingScreen(
              professional: settings.arguments as Professional,
            ),
            '/payment' => PaymentScreen(
              draft: settings.arguments as BookingDraft,
            ),
            '/booking-success' => BookingSuccessScreen(
              booking: settings.arguments as Booking,
            ),
            '/booking-detail' => BookingDetailScreen(
              bookingId: settings.arguments as String,
            ),
            _ => const SplashScreen(),
          };
          return MaterialPageRoute<void>(
            builder: (_) => page,
            settings: settings,
          );
        },
      ),
    );
  }
}
