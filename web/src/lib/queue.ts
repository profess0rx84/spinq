import type { QueueItem } from "@/lib/supabase/types";

export function sortQueue(items: QueueItem[], orderMode: "auto" | "manual"): QueueItem[] {
  if (orderMode === "manual") return [...items].sort((a, b) => a.position - b.position);
  return [...items].sort(
    (a, b) =>
      Number(b.boosted) - Number(a.boosted) ||
      b.votes - a.votes ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}
