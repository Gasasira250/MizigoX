# FixRwanda testing

## What is covered

| Area                                               | File                             |
| -------------------------------------------------- | -------------------------------- |
| Login and registration validation                  | `test/validators_test.dart`      |
| Login widget flow                                  | `test/widget_test.dart`          |
| Create booking, status transitions, cancel, refund | `test/booking_service_test.dart` |
| Successful and failed mock payments                | `test/payment_service_test.dart` |

## Commands (Windows PowerShell)

```powershell
cd fixrwanda
flutter pub get
flutter analyze
flutter test
```

Run one file:

```powershell
flutter test test/booking_service_test.dart
flutter test test/payment_service_test.dart
```

## Manual demo script

1. Log in with `jean.uwase@fixrwanda.rw` / `Password123!`
2. Open Electrical Installation → Eric Niyonzima
3. Book tomorrow, keep the Kimihurura address
4. Pay with MTN `0788001122` and confirm success
5. Open the booking and tap **Simulate next status** through to completed
6. Repeat a booking, move it to **On the way**, then cancel and confirm the 2,000 RWF fee
7. Repeat a payment with `0788001000` to show failure

## What tests do not prove

- Real MTN, Airtel, or bank card APIs
- Real identity verification
- Android emulator rendering (run `flutter run` on your machine for that)
