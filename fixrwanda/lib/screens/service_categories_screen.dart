import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/professional_provider.dart';
import '../widgets/service_category_card.dart';
import 'professionals_screen.dart';

class ServiceCategoriesScreen extends StatelessWidget {
  const ServiceCategoriesScreen({super.key});

  static const routeName = '/categories';

  @override
  Widget build(BuildContext context) {
    final catalog = context.watch<ProfessionalProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('Service categories')),
      body: GridView.builder(
        padding: const EdgeInsets.all(20),
        itemCount: catalog.categories.length,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.1,
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
    );
  }
}
