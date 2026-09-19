# FixRwanda API plan

This document is a plan for a future Node.js + Express + PostgreSQL backend. The Flutter app does **not** call these endpoints yet.

## Base URL

Suggested local development:

```text
https://api.fixrwanda.local/api/v1
```

Flutter would store this in a config class, for example `ApiConfig.baseUrl`, and pass it into HTTP repositories.

## Auth

| Method | Path             | Purpose                  |
| ------ | ---------------- | ------------------------ |
| POST   | `/auth/register` | Create a customer        |
| POST   | `/auth/login`    | Email + password → JWT   |
| POST   | `/auth/logout`   | Invalidate refresh token |
| GET    | `/me`            | Current customer profile |

## Catalogue

| Method | Path                  | Purpose                             |
| ------ | --------------------- | ----------------------------------- |
| GET    | `/service-categories` | List services                       |
| GET    | `/professionals`      | Query `categoryId`, `q`, `location` |
| GET    | `/professionals/:id`  | Profile, verification, reviews      |

## Bookings

| Method | Path                   | Purpose                        |
| ------ | ---------------------- | ------------------------------ |
| POST   | `/bookings`            | Create pending booking         |
| GET    | `/bookings`            | Current customer's bookings    |
| GET    | `/bookings/:id`        | Booking detail                 |
| POST   | `/bookings/:id/cancel` | Apply server-side refund rules |
| POST   | `/bookings/:id/status` | Provider/ops status update     |

Status values: `pending`, `confirmed`, `en_route`, `arrived`, `in_progress`, `completed`, `cancelled`.

## Payments

| Method | Path                        | Purpose                               |
| ------ | --------------------------- | ------------------------------------- |
| POST   | `/payments`                 | Start a collection                    |
| GET    | `/payments/:id`             | Status `pending`, `success`, `failed` |
| POST   | `/payments/webhooks/mtn`    | Future live provider webhook          |
| POST   | `/payments/webhooks/airtel` | Future live provider webhook          |
| POST   | `/payments/webhooks/card`   | Future live provider webhook          |

Do not put provider secrets in the mobile app. The API owns API keys.

## Suggested PostgreSQL tables

- `users`
- `service_categories`
- `professionals`
- `professional_verifications`
- `reviews`
- `bookings`
- `payments`

## Connecting the Flutter app later

1. Add `http` or `dio` to `pubspec.yaml`.
2. Create `lib/api/api_client.dart` with auth header support.
3. Implement `HttpProfessionalRepository` and `HttpBookingRepository` using the existing interfaces.
4. Map JSON `en_route` / `in_progress` with the `apiValue` helpers already on the enums.
5. Keep `BookingPolicy` on the server as the source of truth, and keep the same rules in Flutter only for preview text if the API is slow.

Until that work is done, `MockProfessionalRepository`, `MockBookingRepository`, and `MockAuthRepository` remain the data layer.
