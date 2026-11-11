import { Card } from "@/components/ui";
import { reorderList } from "@/lib/server/inventory";
import { withManager } from "@/lib/server/session";
import { ReorderEditor } from "./reorder-editor";

export default async function ReorderPage() {
  return withManager(async (db) => {
    const groups = await reorderList(db);

    if (groups.length === 0) {
      return (
        <Card>
          <p className="text-sm">Nothing is running low. Items show up here when their count is at or below their reorder level.</p>
        </Card>
      );
    }
    return <ReorderEditor groups={groups} />;
  });
}
