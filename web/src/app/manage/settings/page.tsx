import Link from "next/link";
import { Badge, Card, Field, inputClass, SectionTitle } from "@/components/ui";
import { formatDay, localDateOf } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { listKiosks } from "@/lib/server/kiosk";
import { currentKiosk, withManager } from "@/lib/server/session";
import { enrollKioskAction, revokeKioskAction, setManagerPinAction, updateSettingsAction } from "../actions";
import { ActionForm, SubmitButton } from "../forms";

export default async function SettingsPage() {
  return withManager(async (db, manager) => {
    const [business, kiosks, thisKiosk] = await Promise.all([getBusiness(db), listKiosks(db), currentKiosk()]);
    const accountOnly = manager.via !== "account";

    return (
      <div className="max-w-2xl">
        <h1 className="font-serif text-3xl font-semibold">Settings</h1>

        <SectionTitle>Store kiosk</SectionTitle>
        <Card className="space-y-4">
          <p className="text-sm text-ink/70">
            Only devices set up here show the PIN keypad. Everyone else who opens the site sees the sign-in page.
          </p>
          {kiosks.length > 0 && (
            <div className="divide-y divide-ink/5 rounded-xl border border-ink/10">
              {kiosks.map((kiosk) => (
                <div key={kiosk.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{kiosk.label}</span>{" "}
                    {thisKiosk?.id === kiosk.id && <Badge tone="porcelain">This device</Badge>}
                    <span className="block text-xs text-ink/50">
                      Set up {formatDay(localDateOf(kiosk.createdAt, business.timeZone))}
                      {kiosk.lastSeenAt && ` · last used ${formatDay(localDateOf(kiosk.lastSeenAt, business.timeZone))}`}
                    </span>
                  </span>
                  {!accountOnly && (
                    <ActionForm
                      action={revokeKioskAction}
                      confirm={`Stop using ${kiosk.label} as the kiosk? It will need to be set up again.`}
                    >
                      <input type="hidden" name="id" value={kiosk.id} />
                      <SubmitButton variant="danger">Remove</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              ))}
            </div>
          )}
          {accountOnly ? (
            <p className="text-xs text-ink/50">Adding or removing kiosks needs the manager&rsquo;s account sign-in, not the PIN.</p>
          ) : thisKiosk ? (
            <p className="text-sm text-ink/70">This device is already a kiosk.</p>
          ) : (
            <form action={enrollKioskAction} className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1">
                <Field label="Name for this device">
                  <input name="label" defaultValue="Store iPad" maxLength={40} className={inputClass} />
                </Field>
              </div>
              <SubmitButton>Make this the store kiosk</SubmitButton>
              <p className="basis-full text-xs text-ink/50">
                Do this on the store iPad. It signs you out on that device so the counter only shows the keypad. For a
                full-screen time clock, first add this site to the iPad&rsquo;s Home Screen (Share → Add to Home Screen),
                open it from there, sign in, and set it up from there. Safari and the Home Screen icon are set up
                separately.
              </p>
            </form>
          )}
        </Card>

        <SectionTitle>Manager PIN</SectionTitle>
        <Card>
          <p className="mb-3 text-sm text-ink/70">
            Opens these manager tools on the store iPad (tap <strong>Manager</strong> under the keypad). Keep it different
            from your own clock-in PIN. {business.managerPinDigest ? "A manager PIN is set." : "No manager PIN yet."}
          </p>
          {accountOnly ? (
            <p className="text-xs text-ink/50">Changing the manager PIN needs the manager&rsquo;s account sign-in.</p>
          ) : (
            <ActionForm action={setManagerPinAction} resetOnSuccess className="flex flex-wrap items-end gap-3">
              <div className="w-32">
                <Field label="New PIN">
                  <input name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" className={`${inputClass} font-mono tracking-widest`} />
                </Field>
              </div>
              <div className="w-32">
                <Field label="Type it again">
                  <input name="confirm" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" className={`${inputClass} font-mono tracking-widest`} />
                </Field>
              </div>
              <SubmitButton>{business.managerPinDigest ? "Change manager PIN" : "Set manager PIN"}</SubmitButton>
            </ActionForm>
          )}
        </Card>

        <SectionTitle>Business</SectionTitle>
        <Card>
          <ActionForm action={updateSettingsAction} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Business name">
                <input name="name" defaultValue={business.name} required maxLength={60} className={inputClass} />
              </Field>
            </div>
            <Field label="Missing clock-out warning (hours)" hint="Flag a shift still open after this long.">
              <input name="missingClockOutHours" type="number" min={4} max={24} defaultValue={business.missingClockOutHours} className={inputClass} />
            </Field>
            <Field label="Kiosk returns to keypad after (seconds)" hint="How long an employee's screen stays up.">
              <input name="kioskAutoReturnSeconds" type="number" min={5} max={60} defaultValue={business.kioskAutoReturnSeconds} className={inputClass} />
            </Field>
            <Field label="Inventory count day" hint="The iPad shows “Count due” from the start of this day until a count is finished.">
              <select name="countWeekday" defaultValue={business.countWeekday} className={inputClass}>
                {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-xs text-ink/50 sm:col-span-2">
              Pay periods are weekly, Monday to Sunday, in {business.timeZone.replace("_", " ")} time.
            </p>
            <div>
              <SubmitButton>Save</SubmitButton>
            </div>
          </ActionForm>
        </Card>

        {!accountOnly && (
          <>
            <SectionTitle>Your account</SectionTitle>
            <Card className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink/70">
              <p>Delete your login and remove your email from every team.</p>
              <Link href="/account" className="font-semibold text-red-700 hover:underline">
                Delete my account
              </Link>
            </Card>
          </>
        )}
      </div>
    );
  });
}
