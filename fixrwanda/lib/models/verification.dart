enum VerificationStatus { pending, verified, rejected, expired }

extension VerificationStatusX on VerificationStatus {
  String get apiValue {
    switch (this) {
      case VerificationStatus.pending:
        return 'pending';
      case VerificationStatus.verified:
        return 'verified';
      case VerificationStatus.rejected:
        return 'rejected';
      case VerificationStatus.expired:
        return 'expired';
    }
  }

  String get label {
    switch (this) {
      case VerificationStatus.pending:
        return 'Pending review';
      case VerificationStatus.verified:
        return 'Verified';
      case VerificationStatus.rejected:
        return 'Rejected';
      case VerificationStatus.expired:
        return 'Expired';
    }
  }

  static VerificationStatus fromApi(String value) {
    return VerificationStatus.values.firstWhere(
      (item) => item.apiValue == value,
      orElse: () => VerificationStatus.pending,
    );
  }
}

class VerificationRecord {
  const VerificationRecord({
    required this.idVerified,
    required this.certificateVerified,
    required this.phoneVerified,
    required this.status,
    this.note,
  });

  final bool idVerified;
  final bool certificateVerified;
  final bool phoneVerified;
  final VerificationStatus status;
  final String? note;

  bool get isFullyVerified =>
      status == VerificationStatus.verified &&
      idVerified &&
      certificateVerified &&
      phoneVerified;
}
