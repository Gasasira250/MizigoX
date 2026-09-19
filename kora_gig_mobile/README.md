# Kora Gig (Flutter)

Android marketplace demo: find a verified professional, book a service, pay, track status, and cancel with backend-style refund rules.

This folder is the interview demo app. It is a Flutter client. Verification, booking status, cancellation and refunds are calculated in `lib/services/` the same way a REST API would, so the UI is not the source of truth.

## Demo flow

Login → Home → Find a professional → Profile + verified badge → Book → Pay → Booking status → Cancel / refund

## Run on your computer

From this folder:

```bash
flutter pub get
flutter run
```

Pick your **Android emulator** or a **physical phone** with USB debugging (or wireless debugging) enabled.

Demo login:

- Tap **Use demo account**, or
- Phone / Email: `hannington@koragig.rw`
- Password: `demo123`

Payment is simulated (MTN MoMo, Airtel Money, or Card). No real money is charged.

On the booking screen, use **Demo: professional app** to move status:

Confirmed → En Route → Arrived → In Progress → Completed

Cancellation:

- Before En Route: full refund (30,000 RWF)
- En Route or on site: 2,000 RWF transport fee, refund 28,000 RWF
- Completed: cancellation is not available

Those numbers come from `BookingService`, not from the widgets.

## Tests

```bash
flutter test
```

## Architecture to explain in the interview

```text
Kora Gig Flutter app
        │ REST API (next step)
        ▼
   Backend / API
        │
   PostgreSQL     Payment API (MTN / Airtel / Card)
```

Flutter does not decide ID verification or refunds. It displays `verificationStatus` / refund quotes returned by the backend.
