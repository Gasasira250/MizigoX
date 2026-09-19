import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../models/professional.dart';
import '../theme/app_theme.dart';
import '../widgets/professional_card.dart';
import 'home_screen.dart';

class ProfessionalsScreen extends StatefulWidget {
  const ProfessionalsScreen({super.key, this.args = const ProfessionalsArgs()});

  final ProfessionalsArgs args;

  @override
  State<ProfessionalsScreen> createState() => _ProfessionalsScreenState();
}

class _ProfessionalsScreenState extends State<ProfessionalsScreen> {
  late final TextEditingController _search;
  List<Professional> _professionals = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _search = TextEditingController(text: widget.args.query ?? '');
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final app = KoraGigScope.of(context);
    final results = await app.api.fetchProfessionals(
      trade: widget.args.trade,
      query: _search.text,
    );
    if (!mounted) return;
    setState(() {
      _professionals = results;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.args.trade ?? 'Professionals';
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: TextField(
              controller: _search,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _load(),
              decoration: InputDecoration(
                hintText: 'Search for electrician, plumber...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: IconButton(
                  onPressed: _load,
                  icon: const Icon(Icons.arrow_forward),
                ),
              ),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _professionals.isEmpty
                ? const Center(
                    child: Text(
                      'No professionals match that search.',
                      style: TextStyle(color: AppColors.muted),
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                    itemCount: _professionals.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final professional = _professionals[index];
                      return ProfessionalCard(
                        professional: professional,
                        onViewProfile: () {
                          Navigator.of(
                            context,
                          ).pushNamed('/professional', arguments: professional);
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
