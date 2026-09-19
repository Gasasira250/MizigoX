import 'package:flutter/material.dart';

import '../utils/constants.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  static const routeName = '/settings';

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  var _notifications = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          SwitchListTile(
            title: const Text('Booking notifications'),
            subtitle: const Text('Local preference only. No push provider is connected.'),
            value: _notifications,
            onChanged: (value) => setState(() => _notifications = value),
          ),
          const ListTile(
            title: Text('Language'),
            subtitle: Text('English (demo)'),
          ),
          const ListTile(
            title: Text('Currency'),
            subtitle: Text(AppConstants.currencyCode),
          ),
          const ListTile(
            title: Text('Payments'),
            subtitle: Text(AppConstants.paymentsDisclaimer),
          ),
          const ListTile(
            title: Text('About FixRwanda'),
            subtitle: Text('Kigali home and professional services. Version 1.0.0'),
          ),
        ],
      ),
    );
  }
}
