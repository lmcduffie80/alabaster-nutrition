import type { Metadata } from "next";
import { Badge, Card, SectionTitle, Wordmark } from "@/components/ui";
import { SubmitButton } from "@/app/manage/forms";
import { listInvites, type InviteStatus } from "@/lib/server/invites";
import { requirePlatformOwner } from "@/lib/server/session";
import { cancelInviteAction } from "./actions";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Invites · Platform" };

const statusBadge: Record<InviteStatus, { label: string; tone: "neutral" | "gilt" | "sage" | "red" }> = {
  waiting: { label: "Waiting", tone: "gilt" },
  used: { label: "Joined", tone: "sage" },
  expired: { label: "Expired", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export default async function InvitesPage() {
  const { db } = await requirePlatformOwner();
  const now = new Date();
  const invites = await listInvites(db, now);
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <header className="flex items-center justify-between">
        <Wordmark />
        <span className="text-xs font-semibold uppercase tracking-wider text-ink/50">Platform</span>
      </header>

      <h1 className="mt-6 font-serif text-3xl font-semibold">Invites</h1>
      <p className="text-sm text-ink/60">A sign-up link lets one person create a new business, with them as its manager.</p>

      <Card className="mt-5">
        <InviteForm />
      </Card>

      <SectionTitle>Sent</SectionTitle>
      <Card>
        {invites.length === 0 ? (
          <p className="text-sm text-ink/60">No invites yet.</p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{invite.email}</span>
                <span className="text-ink/60">
                  {invite.status === "used" && invite.businessName ? invite.businessName : `Sent ${day.format(invite.createdAt)}`}
                </span>
                <Badge tone={statusBadge[invite.status].tone}>{statusBadge[invite.status].label}</Badge>
                {invite.status === "waiting" && (
                  <form action={cancelInviteAction}>
                    <input type="hidden" name="id" value={invite.id} />
                    <SubmitButton variant="quiet">Cancel</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
