import { Card } from "@/components/ui";
import { getDb } from "@/db";
import { reorderList } from "@/lib/server/inventory";
import { requireManager } from "@/lib/server/session";
import { ReorderEditor } from "./reorder-editor";

export default async function ReorderPage() {
  await requireManager();
  const groups = await reorderList(await getDb());

  if (groups.length === 0) {
    return (
      <Card>
        <p className="text-sm">Nothing is running low. Items show up here when their count is at or below their reorder level.</p>
      </Card>
    );
  }
  return <ReorderEditor groups={groups} />;
}
