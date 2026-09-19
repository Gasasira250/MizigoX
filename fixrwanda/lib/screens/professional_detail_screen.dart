import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/booking.dart';
import '../providers/auth_provider.dart';
import '../providers/booking_provider.dart';
import '../providers/professional_provider.dart';
import '../utils/constants.dart';
import '../utils/formatters.dart';
import '../widgets/empty_state.dart';
import '../widgets/primary_button.dart';
import '../widgets/rating_widget.dart';
import '../widgets/verification_badge.dart';
import 'booking_screen.dart';

class ProfessionalDetailScreen extends StatelessWidget {
  const ProfessionalDetailScreen({super.key});

  static const routeName = '/professional';

  @override
  Widget build(BuildContext context) {
    final id = ModalRoute.of(context)!.settings.arguments as String;
    final catalog = context.watch<ProfessionalProvider>();
    final professional = catalog.professionalById(id);
    if (professional == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Professional')),
        body: const EmptyState(title: 'Not found', message: 'This professional is not in the mock catalogue.'),
      );
    }
    final category = catalog.categoryById(professional.serviceCategoryId);
    final user = context.watch<AuthProvider>().user;

    return Scaffold(
      appBar: AppBar(title: Text(professional.name)),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 36,
                backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                child: Text(professional.name.substring(0, 1), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(category?.name ?? professional.specialty, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text(professional.location),
                    const SizedBox(height: 8),
                    VerificationBadge(record: professional.verification),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          RatingWidget(rating: professional.rating, completedJobs: professional.completedJobs),
          const SizedBox(height: 8),
          Text(
            'From ${Formatters.rwf(professional.startingPriceRwf)}',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 16),
          Text(professional.description),
          const SizedBox(height: 20),
          Text('Verification', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          VerificationChecklist(record: professional.verification),
          Text(
            professional.verification.note ?? AppConstants.verificationDisclaimer,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 20),
          Text('Reviews', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          if (professional.reviews.isEmpty)
            const EmptyState(title: 'No reviews yet', message: 'This professional has no customer reviews in the demo data.')
          else
            ...professional.reviews.map(
              (review) => Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  title: Text(review.customerName),
                  subtitle: Text(review.comment),
                  trailing: RatingWidget(rating: review.rating, compact: true),
                ),
              ),
            ),
          const SizedBox(height: 88),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: PrimaryButton(
            label: 'Book ${professional.name.split(' ').first}',
            onPressed: () {
              context.read<BookingProvider>().startDraft(
                    BookingDraft(
                      professionalId: professional.id,
                      serviceCategoryId: professional.serviceCategoryId,
                      scheduledAt: DateTime.now().add(const Duration(days: 1)),
                      address: user?.address ?? '',
                      amountRwf: professional.startingPriceRwf,
                    ),
                  );
              Navigator.of(context).pushNamed(BookingScreen.routeName, arguments: professional.id);
            },
          ),
        ),
      ),
    );
  }
}
