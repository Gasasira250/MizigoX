enum VerificationStatus { pending, verified, rejected, expired }

class ServiceCategory {
  const ServiceCategory({
    required this.id,
    required this.name,
    required this.icon,
  });

  final String id;
  final String name;
  final String icon;
}

class Professional {
  const Professional({
    required this.id,
    required this.name,
    required this.trade,
    required this.location,
    required this.rating,
    required this.jobsCompleted,
    required this.tvetVerified,
    required this.idVerified,
    required this.verificationStatus,
    required this.services,
    required this.serviceFeeRwf,
    this.about = 'Trusted local professional available for home and business work across Kigali.',
  });

  final String id;
  final String name;
  final String trade;
  final String location;
  final double rating;
  final int jobsCompleted;
  final bool tvetVerified;
  final bool idVerified;
  final VerificationStatus verificationStatus;
  final List<String> services;
  final int serviceFeeRwf;
  final String about;

  /// UI helper only. The backend remains the source of truth for verification.
  bool get isVerifiedProfessional =>
      verificationStatus == VerificationStatus.verified &&
      (tvetVerified || idVerified);

  String get verificationLabel {
    switch (verificationStatus) {
      case VerificationStatus.verified:
        return 'Verified Professional';
      case VerificationStatus.pending:
        return 'Verification pending';
      case VerificationStatus.rejected:
        return 'Verification rejected';
      case VerificationStatus.expired:
        return 'Verification expired';
    }
  }
}

class Customer {
  const Customer({
    required this.id,
    required this.name,
    required this.identifier,
  });

  final String id;
  final String name;
  final String identifier;
}
