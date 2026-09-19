import '../models/verification.dart';

class VerificationService {
  bool isFullyVerified(VerificationRecord record) => record.isFullyVerified;

  String statusLabel(VerificationRecord record) => record.status.label;

  String badgeLabel(VerificationRecord record) {
    if (record.isFullyVerified) {
      return 'Verified professional';
    }
    return record.status.label;
  }
}
