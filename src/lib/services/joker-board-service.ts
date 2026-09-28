/**
 * joker-board-service.ts — THE Recommendations & Engagement dashboard's read (sia.joker_board, 0251):
 * every opening the jokers made in the last `days` India days, its text, client, queendom, outcome and
 * the words of the reply that set it. Admin client: the CALLER gates (hasJokersAccess). The team's
 * fixes go through correctReplyCore in joker-replies.ts, never here.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { JokerBoardRaw } from "@/lib/utils/joker-board";

// The 0251 function is not in the generated types until the next regen; one loose handle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { rpc: (f: string, a?: Record<string, unknown>) => any };
const sia = (): Loose => createAdminClient().schema("sia") as unknown as Loose;

/** Null when the read failed (the page says so; never a fake empty board). */
export async function getJokerBoard(days = 90): Promise<JokerBoardRaw | null> {
  const { data, error } = await sia().rpc("joker_board", { p_days: days });
  if (error || !data) {
    console.error("[joker-board] read failed", error?.message);
    return null;
  }
  return data as JokerBoardRaw;
}
