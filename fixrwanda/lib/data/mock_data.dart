import 'package:flutter/material.dart';

import '../models/professional.dart';
import '../models/service.dart';
import '../models/user.dart';
import '../models/verification.dart';
import '../utils/constants.dart';

class MockData {
  static const UserAccount demoCustomer = UserAccount(
    id: 'usr_demo_jean',
    fullName: AppConstants.demoName,
    email: AppConstants.demoEmail,
    phone: AppConstants.demoPhone,
    address: AppConstants.demoAddress,
  );

  static const List<ServiceCategory> categories = [
    ServiceCategory(
      id: 'electrical',
      name: 'Electrical Installation',
      description: 'Wiring, lighting, sockets, and electrical safety checks.',
      icon: Icons.electrical_services,
      startingPriceRwf: 25000,
    ),
    ServiceCategory(
      id: 'plumbing',
      name: 'Plumbing',
      description: 'Leaks, toilets, water tanks, and bathroom fittings.',
      icon: Icons.plumbing,
      startingPriceRwf: 20000,
    ),
    ServiceCategory(
      id: 'cleaning',
      name: 'House Cleaning',
      description: 'Home, office, and move-in cleaning across Kigali.',
      icon: Icons.cleaning_services,
      startingPriceRwf: 15000,
    ),
    ServiceCategory(
      id: 'appliance',
      name: 'Appliance Repair',
      description: 'Fridges, cookers, washing machines, and TVs.',
      icon: Icons.kitchen,
      startingPriceRwf: 30000,
    ),
    ServiceCategory(
      id: 'it',
      name: 'Computer/IT Support',
      description: 'Laptops, Wi-Fi, printers, and software setup.',
      icon: Icons.computer,
      startingPriceRwf: 25000,
    ),
    ServiceCategory(
      id: 'mechanic',
      name: 'Car Repair',
      description: 'Diagnostics, servicing, and roadside support.',
      icon: Icons.car_repair,
      startingPriceRwf: 40000,
    ),
    ServiceCategory(
      id: 'painting',
      name: 'Painting',
      description: 'Interior and exterior painting for homes and offices.',
      icon: Icons.format_paint,
      startingPriceRwf: 45000,
    ),
    ServiceCategory(
      id: 'construction',
      name: 'Construction',
      description: 'Masonry, tiling, small builds, and site labour.',
      icon: Icons.construction,
      startingPriceRwf: 60000,
    ),
    ServiceCategory(
      id: 'hair',
      name: 'Hair Styling',
      description: 'Braids, cuts, treatments, and home salon visits.',
      icon: Icons.content_cut,
      startingPriceRwf: 15000,
    ),
    ServiceCategory(
      id: 'beauty',
      name: 'Beauty Services',
      description: 'Makeup, nails, and mobile beauty appointments.',
      icon: Icons.spa,
      startingPriceRwf: 20000,
    ),
  ];

  static final List<Professional> professionals = [
    Professional(
      id: 'pro_eric',
      name: 'Eric Niyonzima',
      serviceCategoryId: 'electrical',
      specialty: 'House wiring and lighting',
      description:
          'Licensed electrician serving Kimihurura and Kacyiru. Installs sockets, lighting, and distribution boards for homes and small offices.',
      location: 'Kimihurura, Kigali',
      startingPriceRwf: 25000,
      rating: 4.8,
      completedJobs: 186,
      verification: const VerificationRecord(
        idVerified: true,
        certificateVerified: true,
        phoneVerified: true,
        status: VerificationStatus.verified,
        note: AppConstants.verificationDisclaimer,
      ),
      reviews: [
        Review(
          id: 'rev_eric_1',
          customerName: 'Diane K.',
          rating: 5,
          comment: 'Fixed our kitchen lighting the same afternoon. Clean work.',
          createdAt: DateTime(2026, 8, 12),
        ),
        Review(
          id: 'rev_eric_2',
          customerName: 'Patrick M.',
          rating: 4.5,
          comment: 'Professional and explained the safety issue clearly.',
          createdAt: DateTime(2026, 7, 3),
        ),
      ],
    ),
    Professional(
      id: 'pro_claudine',
      name: 'Claudine Uwase',
      serviceCategoryId: 'plumbing',
      specialty: 'Bathroom and tank repairs',
      description:
          'Plumber based in Nyamirambo. Handles leaking taps, blocked drains, toilets, and water tank connections.',
      location: 'Nyamirambo, Kigali',
      startingPriceRwf: 20000,
      rating: 4.7,
      completedJobs: 142,
      verification: const VerificationRecord(
        idVerified: true,
        certificateVerified: true,
        phoneVerified: true,
        status: VerificationStatus.verified,
        note: AppConstants.verificationDisclaimer,
      ),
      reviews: [
        Review(
          id: 'rev_claudine_1',
          customerName: 'Alice N.',
          rating: 5,
          comment: 'Stopped a serious leak before it damaged the ceiling.',
          createdAt: DateTime(2026, 8, 28),
        ),
      ],
    ),
    Professional(
      id: 'pro_aline',
      name: 'Aline Mukamana',
      serviceCategoryId: 'cleaning',
      specialty: 'Deep home cleaning',
      description:
          'House cleaning professional covering Remera and Gisozi. Offers regular cleaning and move-in deep cleans.',
      location: 'Remera, Kigali',
      startingPriceRwf: 15000,
      rating: 4.9,
      completedJobs: 210,
      verification: const VerificationRecord(
        idVerified: true,
        certificateVerified: true,
        phoneVerified: true,
        status: VerificationStatus.verified,
        note: AppConstants.verificationDisclaimer,
      ),
      reviews: [
        Review(
          id: 'rev_aline_1',
          customerName: 'Samuel H.',
          rating: 5,
          comment: 'Apartment looked new. Arrived on time with supplies.',
          createdAt: DateTime(2026, 9, 2),
        ),
      ],
    ),
    Professional(
      id: 'pro_jeanpierre',
      name: 'Jean-Pierre Habimana',
      serviceCategoryId: 'appliance',
      specialty: 'Fridge and cooker repair',
      description:
          'Appliance technician in Kicukiro. Repairs fridges, cookers, washing machines, and microwave ovens.',
      location: 'Kicukiro, Kigali',
      startingPriceRwf: 30000,
      rating: 4.6,
      completedJobs: 98,
      verification: const VerificationRecord(
        idVerified: true,
        certificateVerified: true,
        phoneVerified: true,
        status: VerificationStatus.verified,
        note: AppConstants.verificationDisclaimer,
      ),
      reviews: [
        Review(
          id: 'rev_jp_1',
          customerName: 'Chantal U.',
          rating: 4.5,
          comment: 'Fridge is cooling again. Fair starting price.',
          createdAt: DateTime(2026, 6, 18),
        ),
      ],
    ),
    Professional(
      id: 'pro_patrick',
      name: 'Patrick Mugisha',
      serviceCategoryId: 'it',
      specialty: 'Laptop and Wi-Fi support',
      description:
          'IT technician helping homes and small businesses in Nyarutarama with laptops, printers, and Wi-Fi setup.',
      location: 'Nyarutarama, Kigali',
      startingPriceRwf: 25000,
      rating: 4.8,
      completedJobs: 167,
      verification: const VerificationRecord(
        idVerified: true,
        certificateVerified: true,
        phoneVerified: true,
        status: VerificationStatus.verified,
        note: AppConstants.verificationDisclaimer,
      ),
      reviews: [
        Review(
          id: 'rev_patrick_1',
          customerName: 'Irene B.',
          rating: 5,
          comment: 'Office Wi-Fi is stable now. Clear explanation.',
          createdAt: DateTime(2026, 8, 4),
        ),
      ],
    ),
    Professional(
      id: 'pro_divine',
      name: 'Divine Ingabire',
      serviceCategoryId: 'hair',
      specialty: 'Braids and treatments',
      description:
          'Mobile hair stylist serving Kimironko. Specializes in knotless braids, treatments, and event styling.',
      location: 'Kimironko, Kigali',
      startingPriceRwf: 18000,
      rating: 4.9,
      completedJobs: 240,
      verification: const VerificationRecord(
        idVerified: true,
        certificateVerified: true,
        phoneVerified: true,
        status: VerificationStatus.verified,
        note: AppConstants.verificationDisclaimer,
      ),
      reviews: [
        Review(
          id: 'rev_divine_1',
          customerName: 'Keza A.',
          rating: 5,
          comment: 'Beautiful braids and very patient with kids.',
          createdAt: DateTime(2026, 9, 8),
        ),
      ],
    ),
    Professional(
      id: 'pro_emmanuel',
      name: 'Emmanuel Hakizimana',
      serviceCategoryId: 'mechanic',
      specialty: 'Engine diagnostics',
      description:
          'Mechanic in Gikondo. Offers vehicle diagnostics, oil service, and brake checks for personal cars.',
      location: 'Gikondo, Kigali',
      startingPriceRwf: 40000,
      rating: 4.5,
      completedJobs: 121,
      verification: const VerificationRecord(
        idVerified: true,
        certificateVerified: false,
        phoneVerified: true,
        status: VerificationStatus.pending,
        note: AppConstants.verificationDisclaimer,
      ),
      reviews: [
        Review(
          id: 'rev_emmanuel_1',
          customerName: 'Yves T.',
          rating: 4,
          comment: 'Found the battery issue quickly. Waiting on certificate review.',
          createdAt: DateTime(2026, 5, 22),
        ),
      ],
    ),
    Professional(
      id: 'pro_solange',
      name: 'Solange Mukeshimana',
      serviceCategoryId: 'beauty',
      specialty: 'Makeup and nails',
      description:
          'Beauty professional in Kacyiru offering makeup, gel nails, and mobile appointments for events.',
      location: 'Kacyiru, Kigali',
      startingPriceRwf: 22000,
      rating: 4.7,
      completedJobs: 133,
      verification: const VerificationRecord(
        idVerified: true,
        certificateVerified: true,
        phoneVerified: true,
        status: VerificationStatus.verified,
        note: AppConstants.verificationDisclaimer,
      ),
      reviews: [
        Review(
          id: 'rev_solange_1',
          customerName: 'Nadia R.',
          rating: 5,
          comment: 'Wedding makeup lasted the whole day.',
          createdAt: DateTime(2026, 7, 19),
        ),
      ],
    ),
    Professional(
      id: 'pro_isaac',
      name: 'Isaac Bizimana',
      serviceCategoryId: 'painting',
      specialty: 'Interior painting',
      description:
          'Painter covering Kanombe and Kicukiro. Interior walls, ceilings, and small exterior jobs.',
      location: 'Kanombe, Kigali',
      startingPriceRwf: 45000,
      rating: 4.4,
      completedJobs: 76,
      verification: const VerificationRecord(
        idVerified: true,
        certificateVerified: true,
        phoneVerified: false,
        status: VerificationStatus.expired,
        note: AppConstants.verificationDisclaimer,
      ),
      reviews: [
        Review(
          id: 'rev_isaac_1',
          customerName: 'Olivier G.',
          rating: 4,
          comment: 'Good finish. Phone verification has expired in the demo data.',
          createdAt: DateTime(2026, 4, 11),
        ),
      ],
    ),
    Professional(
      id: 'pro_joseph',
      name: 'Joseph Nkurunziza',
      serviceCategoryId: 'construction',
      specialty: 'Tiling and masonry',
      description:
          'Construction worker in Gisozi. Tiling, small masonry repairs, and finishing work for homes.',
      location: 'Gisozi, Kigali',
      startingPriceRwf: 60000,
      rating: 4.3,
      completedJobs: 54,
      verification: const VerificationRecord(
        idVerified: false,
        certificateVerified: false,
        phoneVerified: true,
        status: VerificationStatus.rejected,
        note: AppConstants.verificationDisclaimer,
      ),
      reviews: [
        Review(
          id: 'rev_joseph_1',
          customerName: 'Ange C.',
          rating: 4,
          comment: 'Hard worker. ID documents were marked rejected in this demo.',
          createdAt: DateTime(2026, 3, 9),
        ),
      ],
    ),
    Professional(
      id: 'pro_grace',
      name: 'Grace Uwimana',
      serviceCategoryId: 'cleaning',
      specialty: 'Office cleaning',
      description:
          'Cleans small offices in the CBD and Kimihurura. Flexible after-hours slots.',
      location: 'CBD, Kigali',
      startingPriceRwf: 18000,
      rating: 4.6,
      completedJobs: 88,
      verification: const VerificationRecord(
        idVerified: true,
        certificateVerified: true,
        phoneVerified: true,
        status: VerificationStatus.verified,
        note: AppConstants.verificationDisclaimer,
      ),
      reviews: [
        Review(
          id: 'rev_grace_1',
          customerName: 'Moses K.',
          rating: 4.5,
          comment: 'Reliable weekly office clean.',
          createdAt: DateTime(2026, 8, 21),
        ),
      ],
    ),
    Professional(
      id: 'pro_bruno',
      name: 'Bruno Kalisa',
      serviceCategoryId: 'electrical',
      specialty: 'Generator and backup power',
      description:
          'Electrician in Kacyiru focusing on backup power, sockets, and office lighting maintenance.',
      location: 'Kacyiru, Kigali',
      startingPriceRwf: 35000,
      rating: 4.5,
      completedJobs: 64,
      verification: const VerificationRecord(
        idVerified: true,
        certificateVerified: true,
        phoneVerified: true,
        status: VerificationStatus.pending,
        note: AppConstants.verificationDisclaimer,
      ),
      reviews: [
        Review(
          id: 'rev_bruno_1',
          customerName: 'Linda S.',
          rating: 4.5,
          comment: 'Installed extra sockets safely. Verification still pending in demo.',
          createdAt: DateTime(2026, 9, 1),
        ),
      ],
    ),
  ];
}
