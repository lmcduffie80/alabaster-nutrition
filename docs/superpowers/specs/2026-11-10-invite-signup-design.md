# Invite Sign-up: Design

Date: 2026-11-10
Status: approved in conversation

## 1. Purpose

Let a new business create its own Metzey workspace, but only through a link the platform owner sends, until Stripe billing exists.

## 2. Decisions

- Invite-only. Self-serve without an invite waits for billing.
- The owner creates links on a page only they can see; the app does not send email.
- A link is for one email, works once, and expires after 7 days. The owner can cancel it.
- Onboarding asks only for business name and time zone. The existing "Getting started" checklist on Today covers the rest.

## 3. Data

New table `business_invite`, owned by the platform rather than any business:

| column | notes |
| --- | --- |
| `id` | uuid |
| `email` | normalized; the only email that can use it |
| `token_digest` | hash of the secret in the link (unique); the secret itself is never stored |
| `created_by` | the owner's email |
| `created_at`, `expires_at` | 7 days apart |
| `used_at`, `business_id` | set when redeemed |
| `cancelled_at` | set when cancelled |

Row-level security is enabled with no policy and no grant to `tenant_app`, so only the platform code (the system module) reads or writes it.

## 4. Owner page: `/platform/invites`

- Allowed only when the signed-in, verified email is in `PLATFORM_OWNER_EMAILS` (comma-separated). Everyone else gets a 404.
- Form: email → creates an invite and shows the link once, with a Copy button.
- List: email, created, status (waiting / used, with business name / expired / cancelled), Cancel for waiting ones.

## 5. Redeeming: `/start?invite=<secret>`

1. Not signed in: send to `/sign-up` with a redirect back to this link (sign-in is linked from there for existing accounts).
2. Look up the invite by digest. Expired, used, cancelled, unknown, or for another email → a plain message ("This link has expired…", "This link is for a different email…") telling them to ask for a new one.
3. Valid → form: business name (required, ≤ 60) and time zone (US zones list, default from the browser).
4. Submit re-checks the invite, then in one transaction: create the business, add the person as its manager (display name from their Clerk first name or email), mark the invite used. A second submit of the same link fails as "already used".
5. Set the business-choice cookie to the new business and go to `/manage`.

## 6. Walls

- The new business is created through the system module; everything after runs through `withBusiness`.
- Invites are invisible to `tenant_app`. The tenant test's "every table has row-level security" check covers the new table; it is listed as a platform table, not a business table.

## 7. Testing

- Invite outcomes: valid, expired, used, cancelled, unknown token, wrong email, unverified email.
- Redeeming creates an empty business with one manager, and that manager cannot see Alabaster's data.
- Double-submit makes only one business.
- `/platform/invites` and its actions refuse anyone not in `PLATFORM_OWNER_EMAILS`.

## 8. Not in this piece

Billing, emailing invites, Metzey branding on these screens (they use the current look), and the rest of the owner dashboard.
