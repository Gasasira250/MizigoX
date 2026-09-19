# FixRwanda architecture

## Goal

Ship a customer-facing Flutter app that can be demonstrated in an interview, while keeping a clean path to a real REST backend.

## Layers

```text
Flutter screens (UI only)
        ↓
Providers (app state, loading/error flags)
        ↓
Services (booking rules, refunds, payment abstraction)
        ↓
Repositories (data access)
        ↓
Mock implementations  →  later: REST API client
        ↓
PostgreSQL (future)
```

Screens never contain cancellation math, refund rules, or payment provider details. They call providers. Providers call services and repositories.

## State management

Provider is used because the app has a small number of shared stores:

- `AuthProvider` — session, login, registration, logout
- `ProfessionalProvider` — categories, search, professional list
- `BookingProvider` — draft booking, booking list, status changes, cancel
- `PaymentProvider` — selected method, mock charge, last result

`AppDependencies.demo()` in `lib/main.dart` wires mock repositories. A later API build can construct the same providers with REST repositories.

## Booking status

Canonical API values:

| Enum       | API value     |
| ---------- | ------------- |
| pending    | `pending`     |
| confirmed  | `confirmed`   |
| enRoute    | `en_route`    |
| arrived    | `arrived`     |
| inProgress | `in_progress` |
| completed  | `completed`   |
| cancelled  | `cancelled`   |

Reusable transitions live in `BookingPolicy` (`lib/services/booking_service.dart`):

```text
confirmed → en_route → arrived → in_progress → completed
```

The booking details screen exposes **Simulate next status** only as a demo control. It still calls `BookingManager.advanceDemoStatus`, which refuses illegal jumps.

## Cancellation and refunds

Implemented in `BookingPolicy.calculateRefund`:

- `pending` or `confirmed`: full refund (professional has not started the journey)
- `en_route` or `arrived`: 2,000 RWF transport fee, remainder refunded
- `in_progress` or `completed`: cancellation refused

## Payments

`PaymentService` delegates to a `PaymentGateway` per method:

- `MockMtnMoMoGateway`
- `MockAirtelMoneyGateway`
- `MockCardGateway`

A real MTN, Airtel, or card SDK/API would implement the same `PaymentGateway` interface. This app does not ship live credentials.

## Verification

`VerificationRecord` stores ID, certificate/TVET, phone, and status (`pending`, `verified`, `rejected`, `expired`). The UI labels this as **mock data**. It is not government identity verification.

## Replacing mocks

1. Keep repository interfaces.
2. Add `HttpProfessionalRepository` and `HttpBookingRepository`.
3. Change `AppDependencies.demo()` (or a flavor) to pass the HTTP implementations.
4. Screens stay the same.
