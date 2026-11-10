import Link from "next/link";
import { Card } from "@/components/ui";
import { getDb } from "@/db";
import { localDateOf } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { requireManager } from "@/lib/server/session";
import { deliveryPickers } from "../pickers";
import { RecordDelivery } from "./record-delivery";

export default async function NewDeliveryPage() {
  await requireManager();
  const db = await getDb();
  const [{ items, suppliers, spots }, { timeZone }] = await Promise.all([deliveryPickers(db), getBusiness(db)]);

  return (
    <div>
      <Link href="/manage/inventory/deliveries" className="text-sm text-porcelain hover:underline">
        ← Deliveries
      </Link>
      <h2 className="mb-3 mt-2 font-serif text-2xl font-semibold">Record delivery</h2>
      {spots.length === 0 ? (
        <Card>
          <p className="text-sm">
            Set up{" "}
            <Link href="/manage/inventory/items" className="font-semibold text-porcelain hover:underline">
              storage spots and items
            </Link>{" "}
            first.
          </p>
        </Card>
      ) : (
        <RecordDelivery
          items={items}
          suppliers={suppliers}
          spots={spots}
          blank={{
            supplierId: "",
            invoiceNumber: "",
            invoiceTotal: "",
            receivedOn: localDateOf(new Date(), timeZone),
            onShelfForCount: false,
            lines: [],
          }}
        />
      )}
    </div>
  );
}
