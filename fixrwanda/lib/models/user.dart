class UserAccount {
  const UserAccount({
    required this.id,
    required this.fullName,
    required this.email,
    required this.phone,
    required this.address,
  });

  final String id;
  final String fullName;
  final String email;
  final String phone;
  final String address;

  UserAccount copyWith({
    String? fullName,
    String? phone,
    String? address,
  }) {
    return UserAccount(
      id: id,
      fullName: fullName ?? this.fullName,
      email: email,
      phone: phone ?? this.phone,
      address: address ?? this.address,
    );
  }
}
