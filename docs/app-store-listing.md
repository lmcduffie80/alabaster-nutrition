# Metzey: App Store Connect entries

Copy these into App Store Connect. Character limits are Apple's.

## App Information

- **Name** (30): `Metzey`. If App Store Connect says it's taken, use `Metzey: Shifts & Inventory`.
- **Subtitle** (30): `Time clock, shifts & inventory`
- **Category**: Business. Secondary: Productivity.
- **Content rights**: Doesn't contain, show, or access third-party content.
- **Age rating**: answer "None" / "No" to everything; result 4+.

## Pricing and Availability

- **Price**: Free. The app sells nothing. Businesses subscribe on the website ($4.99/month per business after a
  14-day trial), billed by Agrovus, LLC through Stripe.
- **Distribution**: public, in the United States. Wait until the developer account is an Agrovus, LLC organization
  account (see "Seller: Agrovus, LLC" below) so the App Store shows Agrovus as the seller.

## App Privacy

Privacy Policy URL: `https://app.alabasternutrition.com/privacy`

Data collection: **Yes, we collect data.** For every type below, choose: used for **App Functionality** only,
**Linked to the user**, **Not used for tracking**.

| Category | Type |
| --- | --- |
| Contact Info | Name |
| Contact Info | Email Address |
| User Content | Photos or Videos (invoice photos) |
| User Content | Other User Content (clock-in times, shifts, inventory counts) |
| Identifiers | User ID |

Don't select Location, Contacts, Health, Financial Info, Browsing History, Search History, Usage Data,
Diagnostics, Purchases, or Sensitive Info. (Payments happen on the website through Stripe, never in the app.)

## iOS App 1.0 version page

- **Support URL**: `https://app.alabasternutrition.com/support`
- **Marketing URL**: leave blank.
- **Copyright**: `2026 Agrovus, LLC`
- **Promotional text** (170):

  > The store time clock, staff schedule, and inventory tracker for small businesses, in one simple app.

- **Keywords** (100):

  `time clock,timesheet,schedule,shifts,employee,staff,inventory,kiosk,punch,small business,cafe,store`

- **Description**:

  > Metzey runs the day-to-day of a small shop: who's working, who clocked in, and what's on the shelf.
  >
  > TIME CLOCK
  > Set up the store iPad as a kiosk. Each employee clocks in and out, and starts and ends breaks, with their own
  > 4-digit PIN. Managers see who's on the clock right now and get a warning when someone forgets to clock out.
  >
  > SCHEDULES
  > Build the week's shifts and publish them. Staff sign in on their phone to see their next shift and who
  > they're working with.
  >
  > TIMESHEETS
  > Review hours by pay period, fix missed punches with a full change history, approve, and export to CSV for
  > payroll.
  >
  > INVENTORY
  > Track items by storage spot, run the weekly count on the iPad, log deliveries, and see what to reorder.
  > Photograph a supplier invoice and Metzey fills in the delivery for you to check.
  >
  > MADE FOR TEAMS
  > Each business's information is kept separate and is visible only to its own team. Managers control who's on
  > the team and what they can see.
  >
  > GET STARTED
  > Create an account and set up your business in a minute. New businesses start with a 14-day free trial. Staff
  > join free: the manager adds them, and they sign in with their email.

- **Screenshots**: 6.9-inch iPhone set (1320 × 2868), 3 to 5 images. The iPad set (13-inch, 2064 × 2752) is
  required too, because the app runs on iPad.

## App Review Information

- **Sign-in required**: Yes.
  - User name: `lee+appreview@innovative-cc.com`
  - Password: the demo account's password.
- **Contact**: Donald McDuffie, support@agrovus.com, your phone number.
- **Notes**:

  > Metzey is a business tool for small shops: a store time clock, staff schedules, timesheets, and inventory.
  > Please use the demo account above. It is the manager of a sample business, "Demo Cafe", with sample employees,
  > shifts, and inventory. Demo Cafe is on a free plan.
  >
  > Business model (Guideline 3.1.3(c), Enterprise Services): Metzey is sold to businesses for use by their staff.
  > A business gets a 14-day free trial, then its owner subscribes on our website. The app contains no purchasing,
  > prices, or links to buy: in the app, the Billing page only says to manage the plan on the website. Employees
  > never pay.
  >
  > After signing in you land on the manager's Today screen. Use the tabs for Schedule, Timesheets, Inventory
  > (including the invoice camera under Inventory > Deliveries > New), Team, and Settings.
  >
  > Clock-in is designed for a shared store iPad. To try it, go to Settings > "Make this the store kiosk". This
  > signs the device out and shows the PIN keypad. Employee PINs for Demo Cafe: [fill in]. Enter one to clock
  > in or out. Tap "Manager" under the keypad and enter manager PIN [fill in] to return to the manager tools.
  >
  > Account deletion: Settings > Your account > Delete my account (also linked from the schedule page and
  > from app.alabasternutrition.com/account).
  >
  > The camera is used only when the manager chooses to photograph a delivery invoice.
  >
  > Notifications (1.1): employees can turn on schedule notifications from their schedule page ("Notify me on
  > this phone"). The app asks for permission only when they tap Turn on. A notification is sent when a manager
  > publishes a week or taps "Notify team of changes" on the Schedule tab, and only to people whose shifts
  > changed. Tapping it opens the schedule. Nothing promotional is ever sent.

## Version 1.1

- **What's New**:

  > Schedule notifications: get a notification and an email when your shifts are published or change. Schedules
  > also refresh on their own while open.

- **Build**: 3. Signing note: the archive is built unsigned, then ad-hoc signed with
  `aps-environment = production` before `xcodebuild -exportArchive`, because the team has no registered devices
  for a development profile and an unsigned archive would lose the push entitlement.

- **Export compliance**: the app declares no non-exempt encryption (`ITSAppUsesNonExemptEncryption = NO`), so
  App Store Connect won't ask.

## Seller: Agrovus, LLC

The App Store shows the developer account's legal name as the seller. To show Agrovus, LLC instead of a personal
name, convert the individual account to an organization account before going public:

1. Get a free D-U-N-S number for Agrovus, LLC at <https://developer.apple.com/enroll/duns-lookup/> (look it up first;
   a new one takes about 5 business days).
2. In the Apple Developer app or at <https://developer.apple.com/support/>, contact Membership and Account and ask to
   convert the individual membership to an organization. Have the D-U-N-S number, the LLC's legal name and address,
   and its website ready. Apple usually finishes in one to two weeks.
3. The team ID (V734A7NXTX), the app, its reviews, and the signing keys (including the push notification key) stay
   the same.
4. Then update the Copyright field, the App Review contact, and set Distribution to public.

## Version 1.1 resubmission

1.1 (build 3) is waiting for review with the old invite-only wording. To send the new listing with it:

1. App Store Connect > Metzey > iOS App 1.1 > **Remove from Review** (developer rejection; the build stays).
2. Paste the new Description, Copyright, App Review notes, and contact above.
3. Keep build 3, then **Add for Review** > **Submit to App Review**.
4. Pricing and Availability: leave Free. Don't request unlisted distribution.
