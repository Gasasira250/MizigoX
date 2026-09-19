import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../models/professional.dart';
import '../theme/app_theme.dart';
import '../widgets/professional_card.dart';
import '../widgets/service_card.dart';
import 'bookings_screen.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const [HomeScreen(), BookingsScreen()],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            selectedIcon: Icon(Icons.calendar_month),
            label: 'My Bookings',
          ),
        ],
      ),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _search = TextEditingController();
  List<ServiceCategory> _categories = const [];
  List<Professional> _professionals = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final app = KoraGigScope.of(context);
    final categories = await app.api.fetchCategories();
    final professionals = await app.api.fetchProfessionals();
    if (!mounted) return;
    setState(() {
      _categories = categories;
      _professionals = professionals
          .where((item) => item.isVerifiedProfessional)
          .toList();
      _loading = false;
    });
  }

  void _openProfessionals({String? trade, String? query}) {
    Navigator.of(context).pushNamed(
      '/professionals',
      arguments: ProfessionalsArgs(trade: trade, query: query),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = KoraGigScope.of(context);
    final name = app.customer?.name ?? 'there';

    return SafeArea(
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
              children: [
                Text(
                  'Hello, $name 👋',
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'What service do you need?',
                  style: TextStyle(color: AppColors.muted, fontSize: 16),
                ),
                const SizedBox(height: 18),
                TextField(
                  controller: _search,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (value) => _openProfessionals(query: value),
                  decoration: InputDecoration(
                    hintText: 'Search services...',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.arrow_forward),
                      onPressed: () => _openProfessionals(query: _search.text),
                    ),
                  ),
                ),
                const SizedBox(height: 28),
                const Text(
                  'Popular Services',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 112,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _categories.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 10),
                    itemBuilder: (context, index) {
                      final category = _categories[index];
                      return ServiceCard(
                        category: category,
                        onTap: () => _openProfessionals(trade: category.name),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 28),
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Verified Professionals',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => _openProfessionals(),
                      child: const Text('See all'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 340,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _professionals.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 12),
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

class ProfessionalsArgs {
  const ProfessionalsArgs({this.trade, this.query});

  final String? trade;
  final String? query;
}
