import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../providers/booking_provider.dart';
import '../providers/professional_provider.dart';
import '../utils/formatters.dart';
import '../widgets/booking_status_widget.dart';
import '../widgets/empty_state.dart';
import '../widgets/loading_widget.dart';
import 'booking_detail_screen.dart';

class MyBookingsScreen extends StatefulWidget {
  const MyBookingsScreen({super.key});

  static const routeName = '/bookings';

  @override
  State<MyBookingsScreen> createState() => _MyBookingsScreenState();
}

class _MyBookingsScreenState extends State<MyBookingsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final user = context.read<AuthProvider>().user;
      if (user != null) {
        context.read<BookingProvider>().refresh(user.id);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final bookings = context.watch<BookingProvider>();
    final catalog = context.watch<ProfessionalProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('My bookings')),
      body: bookings.isLoading && bookings.bookings.isEmpty
          ? const LoadingWidget(message: 'Loading bookings...')
          : bookings.error != null && bookings.bookings.isEmpty
              ? ErrorState(
                  message: bookings.error!,
                  onRetry: () {
                    final user = context.read<AuthProvider>().user;
                    if (user != null) {
                      bookings.refresh(user.id);
                    }
                  },
                )
              : bookings.bookings.isEmpty
                  ? const EmptyState(
                      icon: Icons.calendar_month_outlined,
                      title: 'No bookings yet',
                      message: 'Book a professional from the home screen to see it here.',
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(20),
                      itemCount: bookings.bookings.length,
                      separatorBuilder: (context, index) => const SizedBox(height: 12),
                      itemBuilder: (context, index) {
                        final booking = bookings.bookings[index];
                        final professional = catalog.professionalById(booking.professionalId);
                        return Card(
                          child: ListTile(
                            contentPadding: const EdgeInsets.all(16),
                            title: Text(professional?.name ?? 'Professional'),
                            subtitle: Text('${Formatters.dateTime(booking.scheduledAt)}\n${Formatters.rwf(booking.amountRwf)}'),
                            isThreeLine: true,
                            trailing: BookingStatusWidget(status: booking.status),
                            onTap: () => Navigator.of(context).pushNamed(
                              BookingDetailScreen.routeName,
                              arguments: booking.id,
                            ),
                          ),
                        );
                      },
                    ),
    );
  }
}
