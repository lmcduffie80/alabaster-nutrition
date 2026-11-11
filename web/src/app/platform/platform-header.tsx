import Link from "next/link";
import { Wordmark } from "@/components/ui";

const tabs = [
  { href: "/platform", label: "Dashboard" },
  { href: "/platform/invites", label: "Invites" },
] as const;

export function PlatformHeader({ current }: { current: (typeof tabs)[number]["href"] }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <Wordmark />
      <nav className="flex items-center gap-1 text-sm">
        <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-ink/50">Platform</span>
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-3 py-1.5 font-medium ${tab.href === current ? "bg-porcelain-light text-porcelain" : "text-ink/70 hover:bg-ink/5"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
