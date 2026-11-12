"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { recordDeliveryAction } from "../../../inventory-actions";
import { DeliveryForm, type DeliveryFormValues, type PickableItem, type PickableSpot, type PickableSupplier } from "../delivery-form";
import { MAX_SCAN_PHOTOS, ScanCard } from "../scan-card";

export function RecordDelivery({
  items,
  suppliers,
  spots,
  blank,
}: {
  items: PickableItem[];
  suppliers: PickableSupplier[];
  spots: PickableSpot[];
  blank: DeliveryFormValues;
}) {
  const [values, setValues] = useState(blank);
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="space-y-3">
      <ScanCard
        title="Have the invoice?"
        hint={`Take a photo of each page (up to ${MAX_SCAN_PHOTOS}) and the form fills itself in.`}
        buttonLabel="Scan invoice"
        onScanned={(result) => {
          setFormKey((k) => k + 1);
          if (result.kind === "unreadable") {
            setValues({ ...values, photoIds: result.photoIds });
            return { tone: "error", message: "Couldn't read this invoice — enter it below. The photos will be saved with it." };
          }
          const { prefill } = result;
          setValues({ ...prefill, onShelfForCount: false, photoIds: result.photoIds });
          const lines = prefill.lines.length;
          const unmatched = prefill.lines.filter((l) => !l.itemId).length;
          return {
            tone: "info",
            message:
              `Read ${lines} ${lines === 1 ? "line" : "lines"}` +
              (unmatched ? `; ${unmatched} need${unmatched === 1 ? "s" : ""} an item.` : ".") +
              " Check everything against the invoice before saving.",
          };
        }}
      />
      <Card>
        <DeliveryForm
          key={formKey}
          action={recordDeliveryAction}
          items={items}
          suppliers={suppliers}
          spots={spots}
          initial={values}
          submitLabel="Save delivery"
        />
      </Card>
    </div>
  );
}
