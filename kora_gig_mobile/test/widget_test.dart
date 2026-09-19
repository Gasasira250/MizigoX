import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kora_gig_mobile/app.dart';
import 'package:kora_gig_mobile/app_controller.dart';
import 'package:kora_gig_mobile/models/booking.dart';
import 'package:kora_gig_mobile/models/professional.dart';
import 'package:kora_gig_mobile/screens/booking_detail_screen.dart';
import 'package:kora_gig_mobile/widgets/verified_badge.dart';

void main() {
  testWidgets('splash introduces Kora Gig then opens login', (tester) async {
    await tester.pumpWidget(KoraGigApp(controller: AppController()));
    expect(find.text('KORA GIG'), findsOneWidget);
    expect(find.text('Find trusted professionals near you.'), findsOneWidget);

    await tester.pump(const Duration(seconds: 2));
    await tester.pump();
    expect(find.text('Welcome to Kora Gig'), findsOneWidget);
    expect(find.text('Sign In'), findsOneWidget);
  });

  testWidgets('demo login lands on home for Hannington', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(KoraGigApp(controller: AppController()));
    await tester.pump(const Duration(seconds: 2));
    await tester.pump();

    await tester.tap(find.text('Use demo account'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.textContaining('Hello, Hannington'), findsOneWidget);
    expect(find.text('Verified Professionals'), findsOneWidget);
    expect(find.text('John Electrical Services'), findsWidgets);
  });

  testWidgets('verified badge consumes backend verification flags', (
    tester,
  ) async {
    const professional = Professional(
      id: 'pro-john',
      name: 'John Electrical Services',
      trade: 'Electrician',
      location: 'Kigali',
      rating: 4.8,
      jobsCompleted: 126,
      tvetVerified: true,
      idVerified: true,
      verificationStatus: VerificationStatus.verified,
      services: ['Wiring'],
      serviceFeeRwf: 30000,
    );

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: VerifiedBadge(professional: professional)),
      ),
    );

    expect(find.text('✓ Verified Professional'), findsOneWidget);
    expect(find.text('✓ TVET Verified'), findsOneWidget);
    expect(find.text('✓ ID Verified'), findsOneWidget);
  });

  testWidgets(
    'en-route cancellation shows 28,000 RWF refund from backend quote',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final controller = AppController();
      final draft = BookingDraft(
        professionalId: 'pro-john',
        professionalName: 'John Electrical Services',
        trade: 'Electrician',
        service: 'Electrical installation',
        scheduledAt: DateTime(2026, 9, 25, 10),
        location: 'Kigali',
        description: 'Need electrical wiring for my house.',
        serviceFeeRwf: 30000,
      );
      final booking = controller.payAndConfirm(
        draft: draft,
        method: PaymentMethod.mtnMomo,
      );
      controller.simulateProfessionalAction(booking.id);

      await tester.pumpWidget(
        KoraGigScope(
          controller: controller,
          child: MaterialApp(home: BookingDetailScreen(bookingId: booking.id)),
        ),
      );

      expect(find.text('EN ROUTE'), findsOneWidget);
      expect(find.text('Professional is already on the way'), findsOneWidget);
      expect(find.textContaining('28,000'), findsWidgets);
      expect(find.textContaining('2,000'), findsWidgets);

      await tester.ensureVisible(find.text('Confirm Cancellation'));
      await tester.tap(find.text('Confirm Cancellation'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();

      expect(find.text('Booking cancelled'), findsOneWidget);
      expect(controller.bookings.findById(booking.id)!.refundAmountRwf, 28000);
    },
  );
}
