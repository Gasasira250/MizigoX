import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/professional_provider.dart';
import 'professionals_screen.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  static const routeName = '/search';

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _query = TextEditingController();

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  void _go() {
    Navigator.of(context).pushReplacementNamed(
      ProfessionalsScreen.routeName,
      arguments: ProfessionalsArgs(query: _query.text.trim()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final categories = context.watch<ProfessionalProvider>().categories;
    return Scaffold(
      appBar: AppBar(title: const Text('Search')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          TextField(
            controller: _query,
            autofocus: true,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              hintText: 'Electrician in Kimihurura',
            ),
            onSubmitted: (_) => _go(),
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: _go, child: const Text('Search professionals')),
          const SizedBox(height: 24),
          Text('Popular in Kigali', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final category in categories)
                ActionChip(
                  label: Text(category.name),
                  onPressed: () => Navigator.of(context).pushReplacementNamed(
                    ProfessionalsScreen.routeName,
                    arguments: ProfessionalsArgs(categoryId: category.id),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
