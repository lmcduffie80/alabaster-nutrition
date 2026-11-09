import { FramedPanel, Wordmark } from "@/components/ui";
import { requireKiosk } from "@/lib/server/session";
import { SignOutToKiosk } from "./sign-out";

export default async function KioskReadyPage() {
  const kiosk = await requireKiosk();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <Wordmark size="lg" />
      <FramedPanel className="max-w-md px-8 py-6">
        <p className="text-center font-serif text-2xl font-semibold">{kiosk.label} is now the store kiosk</p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-ink/80">
          <li>Your account is signed out on this device, so the counter only shows the keypad.</li>
          <li>
            Keep using the time clock from this same place (Safari, or the Home Screen icon if you set it up from
            there). The other one won&rsquo;t be recognized as the kiosk.
          </li>
          <li>
            Turn on <strong>Guided Access</strong> (Settings → Accessibility → Guided Access), open the time clock, and
            triple-click the top or Home button to keep the iPad in the app.
          </li>
        </ol>
        <SignOutToKiosk />
      </FramedPanel>
    </main>
  );
}
