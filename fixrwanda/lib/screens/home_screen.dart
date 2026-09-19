import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../providers/professional_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/empty_state.dart';
import '../widgets/loading_widget.dart';
import '../widgets/professional_card.dart';
import '../widgets/service_category_card.dart';
import 'professional_detail_screen.dart';
import 'professionals_screen.dart';
import 'search_screen.dart';
import 'service_categories_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final catalog = context.watch<ProfessionalProvider>();
    final firstName = auth.user?.fullName.split(' ').first ?? 'there';

    return Scaffold(
      body: SafeArea(
        child: catalog.isLoading && catalog.categories.isEmpty
            ? const LoadingWidget(message: 'Loading Kigali services...')
            : catalog.error != null && catalog.categories.isEmpty
                ? ErrorState(message: catalog.error!, onRetry: catalog.loadCatalog)
                : RefreshIndicator(
                    onRefresh: catalog.loadCatalog,
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                      children: [
                        Text('Hello, $firstName', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 4),
                        const Text('Find verified professionals around Kigali.'),
                        const SizedBox(height: 18),
                        InkWell(
                          onTap: () => Navigator.of(context).pushNamed(SearchScreen.routeName),
                          borderRadius: BorderRadius.circular(16),
                          child: Ink(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
                            ),
                            child: Row(
                              children: [
                                Icon(Icons.search, color: Theme.of(context).colorScheme.outline),
                                const SizedBox(width: 10),
                                Text(
                                  'Search plumbers, cleaners, electricians...',
                                  style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 22),
                        Container(
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [AppTheme.seed, Color(0xFF12324D)],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Trusted help, when you need it',
                                style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800),
                              ),
                              SizedBox(height: 8),
                              Text(
                                'Book electricians, plumbers, cleaners, and more. Payments in this demo are mock checkouts only.',
                                style: TextStyle(color: Colors.white70),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 24),
                        _sectionTitle(
                          context,
                          'Service categories',
                          onSeeAll: () => Navigator.of(context).pushNamed(ServiceCategoriesScreen.routeName),
                        ),
                        const SizedBox(height: 12),
                        GridView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          itemCount: catalog.categories.take(6).length,
                          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            mainAxisSpacing: 12,
                            crossAxisSpacing: 12,
                            childAspectRatio: 1.15,
                          ),
                          itemBuilder: (context, index) {
                            final category = catalog.categories[index];
                            return ServiceCategoryCard(
                              category: category,
                              onTap: () => Navigator.of(context).pushNamed(
                                ProfessionalsScreen.routeName,
                                arguments: ProfessionalsArgs(categoryId: category.id),
                              ),
                            );
                          },
                        ),
                        const SizedBox(height: 24),
                        _sectionTitle(
                          context,
                          'Top professionals',
                          onSeeAll: () => Navigator.of(context).pushNamed(ProfessionalsScreen.routeName),
                        ),
                        const SizedBox(height: 12),
                        if (catalog.featured.isEmpty)
                          const EmptyState(
                            title: 'No professionals yet',
                            message: 'Pull to refresh the mock catalogue.',
                          )
                        else
                          ...catalog.featured.map(
                            (professional) => Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: ProfessionalCard(
                                professional: professional,
                                category: catalog.categoryById(professional.serviceCategoryId),
                                onTap: () => Navigator.of(context).pushNamed(
                                  ProfessionalDetailScreen.routeName,
                                  arguments: professional.id,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
      ),
    );
  }

  Widget _sectionTitle(BuildContext context, String title, {required VoidCallback onSeeAll}) {
    return Row(
      children: [
        Expanded(
          child: Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        ),
        TextButton(onPressed: onSeeAll, child: const Text('See all')),
      ],
    );
  }
}
