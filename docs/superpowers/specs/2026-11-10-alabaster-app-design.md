# Alabaster App and Idle Sign-Out: Design

Date: 2026-11-10
Status: approved in conversation, section by section

## 1. Purpose

Put the existing website (app.alabasternutrition.com) in an App Store app for Alabaster's own staff, with the native pieces a browser does poorly: a real icon and full-screen feel, push notifications, a locked store iPad, and barcode scanning. Separately, sign people out after 20 minutes of no use.

The website stays the one system and the one database. The iCloud-based native foundation (`milestone-1` branch) is set aside, not deleted.

Audience is Alabaster only. Nothing here is built for other businesses signing up.

## 2. Pieces and order

Each piece ships on its own.

1. **Idle sign-out** (website only, ships first).
2. **App frame** and the first TestFlight build.
3. **Store iPad mode.**
4. **Barcode scanning.**
5. **Notifications.**
6. **Manager dashboard** (onboarding new employees, a reports home, settings). It gets its own design later.

## 3. Idle sign-out

Applies to anyone signed in with an email account (managers, and employees viewing their schedule), in any browser and in the app. The store iPad time clock has no account session and keeps its existing locks: the 10-minute manager-PIN unlock and the 5-minute count session.

### Rules

- **Limit:** 20 minutes with no use. **Warning** at 19 minutes.
- **Use** means a tap, click, key press, scroll, or page change in any open tab of the site.
- **Warning:** a "Still there?" dialog with a live countdown and a **Stay signed in** button. Any use also dismisses it.
- **At 20 minutes:** Clerk sign-out, then `/sign-in?reason=idle`, which says "You were signed out after 20 minutes of inactivity."
- **Coming back** to a tab or the app after more than 20 minutes (for example, phone locked) signs out immediately, without waiting for the warning.

### Browser side

`IdleSignOut` is a client component in the root layout. It is active only while Clerk reports a signed-in user.

- Last use is kept in `localStorage` (`alabaster:last-active`), so tabs share one timer. Other tabs pick up changes through the `storage` event.
- Activity writes are throttled to one every 5 seconds.
- It checks once a second and on `visibilitychange`.
- While the person is active, it sends `POST /api/activity` at most once a minute. That keeps the server's view current while someone types a long form without changing pages.
- The timing rules live in a pure function, `idleStatus(lastActive, now)`, which returns `active`, `warning` (with seconds left) or `expired`.

### Server side

The server side backs up the browser timer and cannot be bypassed by closing a tab.

- `proxy.ts` (after `clerkMiddleware`) keeps an httpOnly cookie, `alabaster_active`, holding `<sessionId>.<lastActiveMs>`.
- **Which requests count as use:** page loads (`Sec-Fetch-Mode: navigate`), client-side page changes (`RSC: 1` without `Next-Router-Prefetch`), server actions (`Next-Action` header), and `POST /api/activity`. Prefetches and static files don't count.
- **No cookie, or a different session ID:** a new sign-in, so the timer starts now.
- **Same session, idle over 20 minutes:**
  - the proxy revokes the session at Clerk;
  - page requests redirect to `/sign-in?reason=idle`;
  - other requests get 401.
  - The cookie is left as is, so the same session stays refused until Clerk's short-lived token runs out.
- `/sign-in` and `/sign-up` are not checked. On `/sign-in?reason=idle`, the page clears any leftover Clerk session in the browser before showing the form.
- The check is the pure function `serverIdleDecision(cookie, sessionId, now, countsAsUse)`.

### Tests

- `idleStatus` boundaries: 18:59 is active, 19:00 is warning, 20:00 is expired.
- `serverIdleDecision`: new session, same session within the limit, same session past the limit, prefetch doesn't refresh.
- Component test with fake timers: warning appears, Stay signed in resets it, sign-out is called at 20 minutes, a `storage` event from another tab resets it.

## 4. App frame

- **App:** "Alabaster", iPhone and iPad, iOS 18 or newer, bundle ID `com.alabasternutrition.app`, team `V734A7NXTX`. The project lives in a new `ios/` folder, generated with XcodeGen.
- **What it shows:** a full-screen `WKWebView` on `https://app.alabasternutrition.com`.
- **Links:**
  - The app domain and Clerk's sign-in domains stay in the app.
  - Everything else opens in Safari.
  - The allow list is a pure function with unit tests.
- **Sign-in:** the default persistent website data store, so sign-in survives relaunches, subject to the 20-minute idle rule.
- **Identifying as the app:** the user agent gets the suffix `AlabasterApp/<version>`. The website shows app-only controls only when it sees this and the native bridge, `window.webkit.messageHandlers.alabaster`.
- **Camera:** `NSCameraUsageDescription` for invoice photos (the existing file input) and, later, scanning.
- **Launch and offline:**
  - The launch screen is sage `#9CAA88` with the jar mark.
  - If loading fails, a native "No connection, retrying…" screen retries every 5 seconds and has a Try again button.
  - Pull to refresh.
- **Icon:**
  - The sage concept is the main icon; the delft blue `#34447F` variant is the dark-mode icon.
  - It needs a 1024 × 1024 master from the owner's original artwork, or a vector redraw. A placeholder is used until then.
- **Distribution:** TestFlight internal testing. The owner creates the app record in App Store Connect and invites testers (Lee).

## 5. Store iPad mode

- A setting in the app, "This is the store iPad", which needs the manager PIN.
- When it's on:
  - the app opens to `/kiosk`;
  - navigation to `/manage` without the manager PIN unlock is blocked;
  - account sign-in pages are hidden.
- Setup instructions in the app walk through turning on Guided Access.

## 6. Barcode scanning

- **Website:** items get an optional, unique `barcode`, editable on the Items page.
- **App:** a Scan button on the count and delivery screens, only inside the app. It opens VisionKit's `DataScannerViewController` and returns the code to the page through the bridge.
- **A known code** jumps to that item. **An unknown code** offers to attach it to an item.

## 7. Notifications

- The app asks permission after sign-in, then registers its APNs device token with the website, linked to the signed-in person.
- The website sends through APNs with a token-based `.p8` key. Creating that key needs the owner's approval, and it's stored only as a Vercel environment variable.
- **First alerts:**
  - inventory count due (staff, on count day);
  - count finished with N items low (managers);
  - delivery total doesn't match its lines (managers).
- Tokens that Apple reports as invalid are deleted.

## 8. Out of scope

Offline mode, public App Store listing, other businesses, and the iCloud-based app.
