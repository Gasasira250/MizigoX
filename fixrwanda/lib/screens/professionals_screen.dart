import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/professional_provider.dart';
import '../widgets/empty_state.dart';
import '../widgets/loading_widget.dart';
import '../widgets/professional_card.dart';
import 'professional_detail_screen.dart';

class ProfessionalsArgs {
  const ProfessionalsArgs({this.categoryId, this.query = ''});

  final String? categoryId;
  final String query;
}

class ProfessionalsScreen extends StatefulWidget {
  const ProfessionalsScreen({super.key});

  static const routeName = '/professionals';

  @override
  State<ProfessionalsScreen> createState() => _ProfessionalsScreenState();
}

class _ProfessionalsScreenState extends State<ProfessionalsScreen> {
  final _query = TextEditingController();
  String? _categoryId;
  var _ready = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) {
      return;
    }
    final args = ModalRoute.of(context)?.settings.arguments;
    final parsed = args is ProfessionalsArgs ? args : const ProfessionalsArgs();
    _categoryId = parsed.categoryId;
    _query.text = parsed.query;
    _ready = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ProfessionalProvider>().search(query: _query.text, categoryId: _categoryId);
    });
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final catalog = context.watch<ProfessionalProvider>();
    final category = _categoryId == null ? null : catalog.categoryById(_categoryId!);
    return Scaffold(
      appBar: AppBar(title: Text(category?.name ?? 'Professionals')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
            child: TextField(
              controller: _query,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: 'Search by name or area',
              ),
              onSubmitted: (value) => catalog.search(query: value, categoryId: _categoryId),
            ),
          ),
          Expanded(
            child: catalog.isLoading
                ? const LoadingWidget(message: 'Finding professionals...')
                : catalog.error != null
                    ? ErrorState(
                        message: catalog.error!,
                        onRetry: () => catalog.search(query: _query.text, categoryId: _categoryId),
                      )
                    : catalog.professionals.isEmpty
                        ? EmptyState(
                            icon: Icons.search_off,
                            title: 'No matches',
                            message: 'Try another name, neighbourhood, or service category.',
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                            itemCount: catalog.professionals.length,
                            separatorBuilder: (_, _) => const SizedBox(height: 12),
                            itemBuilder: (context, index) {
                              final professional = catalog.professionals[index];
                              return ProfessionalCard(
                                professional: professional,
                                category: catalog.categoryById(professional.serviceCategoryId),
                                onTap: () => Navigator.of(context).pushNamed(
                                  ProfessionalDetailScreen.routeName,
                                  arguments: professional.id,
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }
}
