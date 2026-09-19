import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../providers/professional_provider.dart';
import '../theme/app_theme.dart';
import '../utils/constants.dart';
import 'login_screen.dart';
import 'main_shell.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  static const routeName = '/';

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _boot();
      }
    });
  }

  Future<void> _boot() async {
    await Future.wait([
      Future<void>.delayed(AppConstants.splashDelay),
      context.read<ProfessionalProvider>().loadCatalog(),
    ]);
    if (!mounted) {
      return;
    }
    final loggedIn = context.read<AuthProvider>().isLoggedIn;
    Navigator.of(context).pushReplacementNamed(
      loggedIn ? MainShell.routeName : LoginScreen.routeName,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.seed,
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 88,
                height: 88,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: const Icon(Icons.home_repair_service, size: 44, color: AppTheme.seed),
              ),
              const SizedBox(height: 24),
              const Text(
                AppConstants.appName,
                style: TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              const Text(
                AppConstants.tagline,
                style: TextStyle(color: Colors.white70, fontSize: 15),
              ),
              const SizedBox(height: 36),
              const CircularProgressIndicator(color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}
