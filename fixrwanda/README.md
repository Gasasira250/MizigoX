# FixRwanda

FixRwanda is a Kigali-based home and professional services mobile application. Customers can find and book electricians, plumbers, cleaners, appliance repair technicians, IT technicians, mechanics, construction workers, hair stylists, and beauty professionals.

This first version runs entirely on **mock / local data**. There is no live Node.js API, no PostgreSQL connection, no Rwanda government ID verification, and no real MTN MoMo, Airtel Money, or card charging. The code is structured so those integrations can be added later without rewriting screens.

## Features

- Splash, login, and registration
- Home dashboard with Kigali service categories
- Search and professional listings
- Professional details, mock verification badges, ratings, and reviews
- Booking with date, time, address, and summary
- Mock MTN MoMo, Airtel Money, and card payments
- Payment success and failure screens
- Booking confirmation, tracking, and My Bookings
- Cancellation with refund rules in the service layer
- Customer profile and settings
- Loading, empty, and error states

## Technology

- Flutter and Dart
- Material 3
- Provider for state management
- Repository interfaces in front of mock data (ready to swap for REST)
- Service layer for booking transitions, cancellation, refunds, and payments

## Project structure

```text
lib/
  main.dart
  models/          user, professional, service, booking, payment, verification
  screens/         splash through settings
  widgets/         cards, badges, buttons, empty/loading states
  services/        booking policy, booking manager, payment gateways
  repositories/    interfaces + mock implementations
  providers/       auth, professionals, bookings, payments
  utils/           validators, formatters, constants
  theme/           Material 3 theme
  data/            Kigali demo catalogue
test/              validation, booking, payment, and widget tests
docs/              architecture, API plan, testing, Windows PowerShell guide
```

## Install Flutter (Windows)

1. Download the Flutter SDK from https://docs.flutter.dev/get-started/install/windows
2. Extract it, for example to `C:\src\flutter`
3. Add `C:\src\flutter\bin` to your PATH
4. Open a new PowerShell window in VS Code / Cursor

```powershell
flutter --version
dart --version
flutter doctor
```

Accept Android licenses if `flutter doctor` asks:

```powershell
flutter doctor --android-licenses
```

## Install dependencies

From the repository root:

```powershell
cd fixrwanda
flutter pub get
```

## Run the application

List devices:

```powershell
flutter devices
```

Run on the selected emulator or phone:

```powershell
flutter run
```

Run on a specific device id:

```powershell
flutter run -d emulator-5554
```

Demo login:

- Email: `jean.uwase@fixrwanda.rw`
- Password: `Password123!`

Mock payment failure (for demos):

- MTN / Airtel number ending in `000`
- Card number ending in `0000`

## Run tests

```powershell
cd fixrwanda
flutter analyze
flutter test
```

## Build an Android APK

```powershell
cd fixrwanda
flutter build apk --release
```

The APK is written to:

```text
fixrwanda\build\app\outputs\flutter-apk\app-release.apk
```

This Cloud Agent environment does not include a full Android SDK, so the APK should be built on your Windows machine with Android Studio / emulator tools installed.

## Honest limits of this version

- Payments are mock gateways. No API keys and no money movement.
- Verification badges are sample data. They are not NIDA or any government ID check.
- Bookings live in memory for the app session. Restarting the app clears bookings.
- A later Node.js + Express + PostgreSQL API is described in `docs/api-plan.md`.
