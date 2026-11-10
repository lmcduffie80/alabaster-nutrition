import { Card, Field, inputClass, SectionTitle } from "@/components/ui";
import { getDb } from "@/db";
import { listSuppliers, type Supplier } from "@/lib/server/inventory";
import { requireManager } from "@/lib/server/session";
import { ActionForm, SubmitButton } from "../../forms";
import { addSupplierAction, updateSupplierAction } from "../../inventory-actions";

export default async function SuppliersPage() {
  await requireManager();
  const suppliers = await listSuppliers(await getDb(), { includeInactive: true });
  const active = suppliers.filter((s) => s.active);
  const former = suppliers.filter((s) => !s.active);

  return (
    <div className="max-w-3xl">
      <SectionTitle>Add a supplier</SectionTitle>
      <Card>
        <ActionForm action={addSupplierAction} resetOnSuccess>
          <SupplierFields />
          <div className="mt-3">
            <SubmitButton>Add supplier</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <SectionTitle>Suppliers ({active.length})</SectionTitle>
      <div className="space-y-2">
        {active.length === 0 && <p className="text-sm text-ink/50">No suppliers yet.</p>}
        {active.map((supplier) => (
          <Card key={supplier.id} className="p-0">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{supplier.name}</span>
                  {supplier.contact && <span className="block text-xs text-ink/50">{supplier.contact}</span>}
                </span>
                <span className="text-porcelain group-open:hidden">Edit</span>
              </summary>
              <div className="space-y-4 border-t border-ink/5 px-4 py-4">
                <ActionForm action={updateSupplierAction}>
                  <input type="hidden" name="id" value={supplier.id} />
                  <SupplierFields supplier={supplier} />
                  <div className="mt-3">
                    <SubmitButton variant="secondary">Save</SubmitButton>
                  </div>
                </ActionForm>
                <ActionForm action={updateSupplierAction} confirm={`Deactivate ${supplier.name}? Their items keep them as the supplier.`}>
                  <input type="hidden" name="id" value={supplier.id} />
                  <input type="hidden" name="active" value="false" />
                  <SubmitButton variant="danger">Deactivate</SubmitButton>
                </ActionForm>
              </div>
            </details>
          </Card>
        ))}
      </div>

      {former.length > 0 && (
        <>
          <SectionTitle>Former suppliers</SectionTitle>
          <Card className="divide-y divide-ink/5 p-0">
            {former.map((supplier) => (
              <div key={supplier.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-ink/70">{supplier.name}</span>
                <ActionForm action={updateSupplierAction}>
                  <input type="hidden" name="id" value={supplier.id} />
                  <input type="hidden" name="active" value="true" />
                  <SubmitButton variant="quiet">Reactivate</SubmitButton>
                </ActionForm>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

function SupplierFields({ supplier }: { supplier?: Supplier }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name">
        <input name="name" defaultValue={supplier?.name} required maxLength={80} className={inputClass} />
      </Field>
      <Field label="Contact" hint="Phone, email, or website.">
        <input name="contact" defaultValue={supplier?.contact} maxLength={200} className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Notes" hint="Order days, minimums, account number…">
          <textarea name="notes" defaultValue={supplier?.notes} maxLength={1000} rows={2} className={inputClass} />
        </Field>
      </div>
    </div>
  );
}
