import Link from "next/link";
import { Card } from "@/components/ui";
import { withManager } from "@/lib/server/session";
import { deliveryPickers } from "../../deliveries/pickers";
import { ReceiptItems } from "./receipt-items";

export default async function ItemsFromReceiptPage() {
  return withManager(async (db) => {
    const { items, suppliers, spots } = await deliveryPickers(db);

    return (
      <div>
        <Link href="/manage/inventory/items" className="text-sm text-porcelain hover:underline">
          ← Items
        </Link>
        <h2 className="mb-1 mt-2 font-serif text-2xl font-semibold">Add items from a receipt</h2>
        <p className="mb-3 text-sm text-ink/60">
          Each product on the receipt becomes an item with the supplier&rsquo;s code, so later receipts match it. What you
          have on hand becomes its starting stock, and the receipt is saved as a delivery for its prices.
        </p>
        {spots.length === 0 ? (
          <Card>
            <p className="text-sm">
              Add a{" "}
              <Link href="/manage/inventory/items" className="font-semibold text-porcelain hover:underline">
                storage spot
              </Link>{" "}
              first, so new items have somewhere to live.
            </p>
          </Card>
        ) : (
          <ReceiptItems items={items} suppliers={suppliers} spots={spots} />
        )}
      </div>
    );
  });
}
