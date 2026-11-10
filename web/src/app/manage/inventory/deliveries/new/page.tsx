import Link from "next/link";
import { Card } from "@/components/ui";
import { getDb } from "@/db";
import { localDateOf } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { requireManager } from "@/lib/server/session";
import { recordDeliveryAction } from "../../../inventory-actions";
import { DeliveryForm } from "../delivery-form";
import { deliveryPickers } from "../pickers";

export default async function NewDeliveryPage() {
  await requireManager();
  const db = await getDb();
  const [{ items, suppliers }, { timeZone }] = await Promise.all([deliveryPickers(db), getBusiness(db)]);

  return (
    <div>
      <Link href="/manage/inventory/deliveries" className="text-sm text-porcelain hover:underline">
        ← Deliveries
      </Link>
      <h2 className="mb-3 mt-2 font-serif text-2xl font-semibold">Record delivery</h2>
      {items.length === 0 || suppliers.length === 0 ? (
        <Card>
          <p className="text-sm">
            Add your{" "}
            <Link href="/manage/inventory/suppliers" className="font-semibold text-porcelain hover:underline">
              suppliers
            </Link>{" "}
            and{" "}
            <Link href="/manage/inventory/items" className="font-semibold text-porcelain hover:underline">
              items
            </Link>{" "}
            first.
          </p>
        </Card>
      ) : (
        <Card>
          <DeliveryForm
            action={recordDeliveryAction}
            items={items}
            suppliers={suppliers}
            submitLabel="Save delivery"
            initial={{
              supplierId: "",
              invoiceNumber: "",
              invoiceTotal: "",
              receivedOn: localDateOf(new Date(), timeZone),
              onShelfForCount: false,
              lines: [],
            }}
          />
        </Card>
      )}
    </div>
  );
}
