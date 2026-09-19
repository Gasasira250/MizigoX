import 'verification.dart';

class Review {
  const Review({
    required this.id,
    required this.customerName,
    required this.rating,
    required this.comment,
    required this.createdAt,
  });

  final String id;
  final String customerName;
  final double rating;
  final String comment;
  final DateTime createdAt;
}

class Professional {
  const Professional({
    required this.id,
    required this.name,
    required this.serviceCategoryId,
    required this.description,
    required this.location,
    required this.startingPriceRwf,
    required this.rating,
    required this.completedJobs,
    required this.verification,
    required this.reviews,
    this.profileImageUrl,
    this.specialty = '',
  });

  final String id;
  final String name;
  final String? profileImageUrl;
  final String serviceCategoryId;
  final String description;
  final String location;
  final int startingPriceRwf;
  final double rating;
  final int completedJobs;
  final VerificationRecord verification;
  final List<Review> reviews;
  final String specialty;

  bool get phoneVerified => verification.phoneVerified;
  bool get idVerified => verification.idVerified;
  bool get certificateVerified => verification.certificateVerified;
  VerificationStatus get verificationStatus => verification.status;
}
