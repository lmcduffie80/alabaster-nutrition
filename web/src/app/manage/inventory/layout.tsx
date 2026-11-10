import { NavLink } from "../forms";

const tabs = [
  { href: "/manage/inventory", label: "Stock", exact: true },
  { href: "/manage/inventory/reorder", label: "Reorder list" },
  { href: "/manage/inventory/deliveries", label: "Deliveries" },
  { href: "/manage/inventory/counts", label: "Counts" },
  { href: "/manage/inventory/reports", label: "Reports" },
  { href: "/manage/inventory/items", label: "Items" },
  { href: "/manage/inventory/suppliers", label: "Suppliers" },
];

export default function InventoryLayout({ children }: LayoutProps<"/manage/inventory">) {
  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-3xl font-semibold">Inventory</h1>
      <nav className="mb-5 mt-3 flex gap-1 overflow-x-auto border-b border-ink/10 pb-2 print:hidden">
        {tabs.map((tab) => (
          <NavLink key={tab.href} href={tab.href} exact={tab.exact}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  );
}
