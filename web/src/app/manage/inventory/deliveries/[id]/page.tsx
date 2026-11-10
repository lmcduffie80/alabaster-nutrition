import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Field, inputClass, SectionTitle } from "@/components/ui";
import { getDb } from "@/db";
import { formatMoney, formatQuantity } from "@/lib/domain/inventory";
import { formatDay } from "@/lib/domain/time";
import { getDelivery } from "@/lib/server/inventory";
import { deliveryPhotos } from "@/lib/server/invoice-scan";
import { requireManager } from "@/lib/server/session";
import { ActionForm, SubmitButton } from "../../../forms";
import { deleteDeliveryAction, updateDeliveryAction } from "../../../inventory-actions";
import { DeliveryForm } from "../delivery-form";
import { deliveryPickers } from "../pickers";

const amount = (value: number | null) => (value === null ? "" : String(value));

export default async function DeliveryPage({ params }: PageProps<"/manage/inventory/deliveries/[id]">) {
  await requireManager();
  const { id } = await params;
  const db = await getDb();
  const found = await getDelivery(db, id);
  if (!found) notFound();
  const [{ items, suppliers, spots }, photos] = await Promise.all([
    deliveryPickers(db, { supplierId: found.supplierId, itemIds: found.lines.map((l) => l.itemId) }),
    deliveryPhotos(db, found.id),
  ]);

  return (
    <div>
      <Link href="/manage/inventory/deliveries" className="text-sm text-porcelain hover:underline">
        ← Deliveries
      </Link>
      <div className="mt-2">
        <h2 className="font-serif text-2xl font-semibold">{found.supplierName}</h2>
        <p className="text-sm text-ink/60">
          Received {formatDay(found.receivedOn, "long")}
          {found.invoiceNumber && ` · Invoice ${found.invoiceNumber}`} · recorded by {found.recordedBy}
        </p>
      </div>

      <Card className="mt-4 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink/50">
            <tr>
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 font-medium">Received</th>
              <th className="px-4 py-2 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {found.lines.map((line, index) => (
              <tr key={index}>
                <td className="px-4 py-2">
                  <span className="font-medium">{line.name}</span>
                  {(line.invoiceCode || line.invoiceDescription) && (
                    <span className="block text-xs text-ink/50">
                      {[line.invoiceCode, line.invoiceDescription].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 tabular-nums">{formatQuantity(line.quantity, line.unit)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatMoney(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-ink/10 font-semibold">
            <tr>
              <td className="px-4 py-2" colSpan={2}>
                Total
                {found.invoiceTotal !== null && found.total !== found.invoiceTotal && (
                  <span className="ml-2 text-xs font-medium text-red-700">Invoice says {formatMoney(found.invoiceTotal)}</span>
                )}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{formatMoney(found.total)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {photos.length > 0 && (
        <>
          <SectionTitle>Invoice</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {photos.map((photo) => (
              <a key={photo.id} href={`/manage/inventory/photos/${photo.id}`} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, served by our own route */}
                <img
                  src={`/manage/inventory/photos/${photo.id}`}
                  alt={`Invoice page ${photo.page}`}
                  className="h-40 w-auto rounded-lg border border-ink/10 object-cover"
                />
              </a>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Fix this delivery</SectionTitle>
      <Card className="p-0">
        <details>
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-porcelain">Edit</summary>
          <div className="border-t border-ink/5 px-4 py-4">
            <DeliveryForm
              action={updateDeliveryAction}
              items={items}
              suppliers={suppliers}
              spots={spots}
              submitLabel="Save changes"
              initial={{
                id: found.id,
                supplierId: found.supplierId,
                invoiceNumber: found.invoiceNumber ?? "",
                invoiceTotal: amount(found.invoiceTotal),
                receivedOn: found.receivedOn,
                onShelfForCount: found.onShelfForCount,
                lines: found.lines.map((l) => ({
                  itemId: l.itemId,
                  quantity: String(l.quantity),
                  lineTotal: amount(l.lineTotal),
                  invoiceCode: l.invoiceCode ?? undefined,
                  invoiceDescription: l.invoiceDescription ?? undefined,
                })),
              }}
            />
          </div>
        </details>
      </Card>
      <Card className="mt-2 p-0">
        <details>
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-red-700">Delete</summary>
          <ActionForm
            action={deleteDeliveryAction}
            confirm="Delete this delivery? Stock and costs go back to how they were without it."
            className="flex flex-wrap items-end gap-3 border-t border-ink/5 px-4 py-4"
          >
            <input type="hidden" name="id" value={found.id} />
            <div className="min-w-60 flex-1">
              <Field label="Reason">
                <input name="reason" required maxLength={200} placeholder="Entered twice, wrong supplier…" className={inputClass} />
              </Field>
            </div>
            <SubmitButton variant="danger">Delete delivery</SubmitButton>
          </ActionForm>
        </details>
      </Card>
    </div>
  );
}
