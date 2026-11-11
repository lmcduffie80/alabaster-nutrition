# Multiple Businesses: Design

Date: 2026-11-10
Status: approved in conversation (sections 1 and 2)

## 1. Purpose

Turn the single-store website into one system that holds many businesses, as the base for selling it as a product. Each business sees only its own data. Alabaster becomes business #1 with no visible change.

This piece covers only the data, the walls between businesses, and sign-in routing. Later pieces, each with its own design:

1. self-serve sign-up and onboarding;
2. product brand (the product is named **Metzey**) and per-business branding;
3. Stripe billing;
4. the platform owner's dashboard;
5. the public App Store listing.

### Decisions

- One store per account; locations are a possible later addition.
- Every customer gets every feature, in one plan.
- One web address for everyone. The business comes from the sign-in, not the URL.

## 2. Data model

- **`business`** becomes a normal table. `id` is an integer identity, and Alabaster keeps `id = 1`; the sequence restarts at 2. The `default(1)` is dropped.
- **Every other table** gets `business_id integer not null references business(id)`. The migration fills it with `1` for existing rows, then sets `not null`.
  - The tables: `employee`, `kiosk_device`, `punch`, `punch_audit`, `schedule_week`, `shift`, `timesheet_approval`, `storage_spot`, `supplier`, `inventory_item`, `inventory_count`, `inventory_count_line`, `delivery`, `delivery_line`, `invoice_photo`, `invoice_scan` and `inventory_audit`.
- **Links can't cross businesses.** Each referenced table gets `unique (business_id, id)`, and each reference becomes a composite foreign key, for example `(business_id, employee_id) → employee (business_id, id)`.
- **Uniqueness is per business:**
  - employee email and active PIN;
  - spot, supplier and item names;
  - an item's supplier code;
  - one open count;
  - a delivery's invoice number;
  - the schedule week. Its primary key becomes `(business_id, week_start)`.
  - Global uniques stay global: the kiosk `token_digest` and the punch `request_id`.
- **Per-business limits:** the invoice-scan daily limit counts within the business.

## 3. Walls between businesses

### Database-enforced (row-level security)

- The migration creates a `NOLOGIN` role, `tenant_app`. It gets `select/insert/update/delete` on all business tables and usage on their sequences, and the migration user is granted membership.
- Every business table gets row-level security enabled and this policy:
  ```sql
  using (business_id = nullif(current_setting('app.business_id', true), '')::int)
  with check (business_id = nullif(current_setting('app.business_id', true), '')::int)
  ```
  With no business set, nothing matches, so nothing is visible or writable.
- `business` itself gets a policy matching on `id`.

### Scoped access

`withBusiness(businessId, work)` runs `work(tx)` in one transaction that first runs these, both transaction-local:

```sql
select set_config('app.business_id', $1, true);
set local role tenant_app;
```

- The setting ends with the transaction, which keeps it safe with Neon's pooled connections.
- Pages, route handlers and server actions get their database only through this. `managerForm` and the kiosk actions wrap their work in it. Each page loads its data inside one `withBusiness` call.
- New rows get `business_id` from `current_setting` through a column default, so existing insert code needs no changes. The `with check` policy rejects any other value.

### System access (no business yet)

A small, separate `system` module is the only code that uses the database without `withBusiness`. It covers:

- finding which businesses list an email;
- looking up a kiosk device by token;
- creating a business;
- the `MANAGER_EMAILS` fallback for Alabaster.

It returns only IDs and the fields sign-in needs. Everything else in `lib/server` accepts the scoped transaction.

### The business comes from the sign-in only

- **Account sign-in:** verified email → the active employee rows with that email.
  - None found and the email is in `MANAGER_EMAILS`: Alabaster (business 1) as manager, as today.
  - One business: use it.
  - More than one: `/choose-business`, which stores the choice in a signed cookie. The choice is re-checked against the person's businesses on every request.
- **Store iPad:** the kiosk cookie → device → its `business_id`.
- **Manager rights:** the role on that business's employee row. `MANAGER_EMAILS` applies only to business 1, as a fallback.
- **Never trusted:** a business ID from a form, a query or a header.

### Files

- New invoice photos are stored under `invoices/<businessId>/<uuid>.jpg`.
- The photo route loads the `invoice_photo` row through `withBusiness`, so another business's photo ID returns 404.
- Existing photos keep their paths; their rows carry `business_id = 1`.

## 4. Testing

- **Fixture:** two businesses, each with an employee, a manager, a kiosk, items, a delivery with a photo, a count, shifts and punches.
- **Isolation tests:**
  - For every server module, business A can't list, read, edit, delete or export B's records.
  - A's IDs submitted in B's forms come back "no longer exists."
  - B's photo ID returns 404 for A.
- **Database tests:**
  - With the role set, an unfiltered `select` returns only the current business's rows.
  - An `insert` with another `business_id` fails.
  - A composite foreign key across businesses fails.
  - With no business set, nothing is returned.
- **Migration test:** apply the migrations to a database holding today's single-business data (via the PGlite snapshot), and check that every row lands in business 1 and the app tests pass.
- **Kept passing:** the existing 116 tests, adapted to run inside `withBusiness`.

## 5. Rollout

- Built on its own branch. The migration runs only on the production deploy, which is the existing rule.
- Before merging, the migration is rehearsed on a Neon branch copied from production, with the app pointed at it.
- After merging, check that Alabaster's pages, kiosk, exports and photos still work.
- A security review of the change runs before the first paying customer.

## 6. Out of scope

Sign-up, billing, branding, the platform dashboard, multiple locations per business, and moving existing photos.
