import { UserButton } from "@clerk/nextjs";
import { CalendarDays, FileSpreadsheet, Package, Settings, Sun, Users } from "lucide-react";
import type { Metadata } from "next";
import { Wordmark } from "@/components/ui";
import { requireManager } from "@/lib/server/session";
import { KioskLock, NavLink } from "./forms";

export const metadata: Metadata = { title: "Manager · Alabaster Nutrition" };

const links = [
  { href: "/manage", label: "Today", icon: Sun },
  { href: "/manage/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/manage/timesheets", label: "Timesheets", icon: FileSpreadsheet },
  { href: "/manage/inventory", label: "Inventory", icon: Package },
  { href: "/manage/team", label: "Team", icon: Users },
  { href: "/manage/settings", label: "Settings", icon: Settings },
];

export default async function ManageLayout({ children }: LayoutProps<"/manage">) {
  const manager = await requireManager();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-ink/10 bg-white/80 p-2 md:w-44 md:flex-col md:items-stretch md:border-b-0 md:border-r md:p-3 md:pt-8">
        <div className="mr-2 md:mb-4 md:mr-0">
          <Wordmark />
        </div>
        {links.map(({ href, label, icon: Icon }) => (
          <NavLink key={href} href={href}>
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
        <div className="ml-auto md:ml-0 md:mt-auto">
          {manager.via === "kiosk" ? (
            <KioskLock />
          ) : (
            <div className="flex items-center gap-2 px-2 text-xs text-ink/60">
              <UserButton />
              <span className="hidden md:inline">Signed in</span>
            </div>
          )}
        </div>
      </nav>
      <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
