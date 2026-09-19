import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../theme/app_theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit(AppController app) async {
    if (!_formKey.currentState!.validate()) return;
    final ok = await app.signIn(
      identifier: _identifier.text,
      password: _password.text,
    );
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pushReplacementNamed('/home');
    }
  }

  Future<void> _demo(AppController app) async {
    _identifier.text = 'hannington@koragig.rw';
    _password.text = 'demo123';
    final ok = await app.signInDemo();
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pushReplacementNamed('/home');
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = KoraGigScope.of(context);
    return Scaffold(
      body: SafeArea(
        child: ListenableBuilder(
          listenable: app,
          builder: (context, _) {
            return ListView(
              padding: const EdgeInsets.fromLTRB(24, 36, 24, 24),
              children: [
                const Text(
                  'Welcome to Kora Gig',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Sign in to book verified professionals in Kigali.',
                  style: TextStyle(color: AppColors.muted, fontSize: 15),
                ),
                const SizedBox(height: 28),
                Form(
                  key: _formKey,
                  child: Column(
                    children: [
                      TextFormField(
                        controller: _identifier,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'Phone / Email',
                          hintText: '0780000000 or you@email.com',
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Enter your phone or email';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _password,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Password',
                        ),
                        validator: (value) {
                          if (value == null || value.trim().length < 4) {
                            return 'Password must be at least 4 characters';
                          }
                          return null;
                        },
                      ),
                    ],
                  ),
                ),
                if (app.error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    app.error!,
                    style: const TextStyle(color: AppColors.danger),
                  ),
                ],
                const SizedBox(height: 22),
                FilledButton(
                  onPressed: app.busy ? null : () => _submit(app),
                  child: app.busy
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Sign In'),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: app.busy ? null : () => _demo(app),
                  child: const Text('Use demo account'),
                ),
                const SizedBox(height: 28),
                const Text(
                  "Don't have an account?",
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.muted),
                ),
                TextButton(
                  onPressed: () => Navigator.of(context).pushNamed('/register'),
                  child: const Text('Create Account'),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _name = TextEditingController();
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _name.dispose();
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit(AppController app) async {
    if (!_formKey.currentState!.validate()) return;
    final ok = await app.createAccount(
      name: _name.text,
      identifier: _identifier.text,
      password: _password.text,
    );
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pushNamedAndRemoveUntil('/home', (_) => false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = KoraGigScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Create Account')),
      body: ListenableBuilder(
        listenable: app,
        builder: (context, _) {
          return ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const Text(
                'Demo registration only — no backend account is created yet.',
                style: TextStyle(color: AppColors.muted),
              ),
              const SizedBox(height: 20),
              Form(
                key: _formKey,
                child: Column(
                  children: [
                    TextFormField(
                      controller: _name,
                      decoration: const InputDecoration(labelText: 'Full name'),
                      validator: (value) =>
                          value == null || value.trim().isEmpty
                          ? 'Enter your name'
                          : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _identifier,
                      decoration: const InputDecoration(
                        labelText: 'Phone / Email',
                      ),
                      validator: (value) =>
                          value == null || value.trim().isEmpty
                          ? 'Enter phone or email'
                          : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _password,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Password'),
                      validator: (value) =>
                          value == null || value.trim().length < 4
                          ? 'Use at least 4 characters'
                          : null,
                    ),
                  ],
                ),
              ),
              if (app.error != null) ...[
                const SizedBox(height: 12),
                Text(
                  app.error!,
                  style: const TextStyle(color: AppColors.danger),
                ),
              ],
              const SizedBox(height: 22),
              FilledButton(
                onPressed: app.busy ? null : () => _submit(app),
                child: const Text('Create Account'),
              ),
            ],
          );
        },
      ),
    );
  }
}
