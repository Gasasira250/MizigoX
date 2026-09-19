import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../utils/constants.dart';
import '../widgets/empty_state.dart';
import 'login_screen.dart';
import 'settings_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  static const routeName = '/profile';

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    if (user == null) {
      return const EmptyState(title: 'Not signed in', message: 'Log in to view your profile.');
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          CircleAvatar(
            radius: 40,
            backgroundColor: Theme.of(context).colorScheme.primaryContainer,
            child: Text(user.fullName.substring(0, 1), style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800)),
          ),
          const SizedBox(height: 16),
          Text(user.fullName, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
          Text(user.email),
          const SizedBox(height: 20),
          Card(
            child: Column(
              children: [
                ListTile(leading: const Icon(Icons.phone), title: const Text('Phone'), subtitle: Text(user.phone)),
                ListTile(leading: const Icon(Icons.place_outlined), title: const Text('Address'), subtitle: Text(user.address)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const Icon(Icons.settings_outlined),
              title: const Text('Settings'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).pushNamed(SettingsScreen.routeName),
            ),
          ),
          const SizedBox(height: 12),
          Text(AppConstants.verificationDisclaimer, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 20),
          OutlinedButton(
            onPressed: () async {
              await context.read<AuthProvider>().logout();
              if (context.mounted) {
                Navigator.of(context).pushNamedAndRemoveUntil(LoginScreen.routeName, (route) => false);
              }
            },
            child: const Text('Log out'),
          ),
        ],
      ),
    );
  }
}
