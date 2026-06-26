import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

/**
 * cleanup-rooms Edge Function
 *
 * Requires x-cleanup-secret header matching CLEANUP_SECRET env var.
 * Uses SERVICE_ROLE_KEY for DB access.
 *
 * Cleanup rules:
 * 1. Stale memberships: online=true but last_seen_at > 60s ago → mark offline
 * 2. Empty active rooms: no recent online members → mark completed
 * 3. Old completed rooms: completed_at > 24h ago → delete (memberships first, then room)
 *
 * Manual invocation:
 *   curl -X POST https://<project>.supabase.co/functions/v1/cleanup-rooms \
 *     -H "x-cleanup-secret: <CLEANUP_SECRET>" \
 *     -H "Content-Type: application/json" \
 *     -d '{}'
 */

const STALE_TIMEOUT_SECONDS = 60;
const COMPLETED_RETENTION_HOURS = 24;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cleanup-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth: require CLEANUP_SECRET
    const secret = Deno.env.get("CLEANUP_SECRET");
    if (!secret) return json({ error: "CLEANUP_SECRET not configured on server" }, 500);
    const provided = req.headers.get("x-cleanup-secret") ?? "";
    if (provided !== secret) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const stats = { stale_memberships: 0, completed_rooms: 0, deleted_rooms: 0, deleted_memberships: 0 };

    // --- 1. Mark stale memberships offline ---
    const staleCutoff = new Date(Date.now() - STALE_TIMEOUT_SECONDS * 1000).toISOString();
    try {
      const { data: staleMembers } = await supabase
        .from("room_memberships")
        .select("room_id,user_id,disconnected_at")
        .eq("online", true)
        .lt("last_seen_at", staleCutoff);

      if (staleMembers && staleMembers.length > 0) {
        for (const m of staleMembers) {
          const { error } = await supabase
            .from("room_memberships")
            .update({
              online: false,
              disconnected_at: m.disconnected_at ?? new Date().toISOString(),
            })
            .eq("room_id", m.room_id)
            .eq("user_id", m.user_id);
          if (!error) stats.stale_memberships++;
        }
      }
    } catch {
      // last_seen_at column may not exist yet; skip stale membership cleanup
    }

    // --- 2. Complete empty active rooms ---
    // Find active rooms with no recent online members
    const { data: activeRooms } = await supabase
      .from("rooms")
      .select("room_id")
      .eq("status", "active");

    if (activeRooms) {
      for (const room of activeRooms) {
        // Count online members with recent heartbeat
        let hasOnline = false;
        try {
          const { count } = await supabase
            .from("room_memberships")
            .select("user_id", { count: "exact", head: true })
            .eq("room_id", room.room_id)
            .eq("online", true)
            .gte("last_seen_at", staleCutoff);
          hasOnline = (count ?? 0) > 0;
        } catch {
          // last_seen_at may not exist; fallback to just online
          const { count } = await supabase
            .from("room_memberships")
            .select("user_id", { count: "exact", head: true })
            .eq("room_id", room.room_id)
            .eq("online", true);
          hasOnline = (count ?? 0) > 0;
        }

        if (!hasOnline) {
          const now = new Date().toISOString();
          await updateCompatible(
            supabase,
            "rooms",
            { status: "completed", current_players: 0, completed_at: now },
            (query: any) => query.eq("room_id", room.room_id).eq("status", "active"),
          );
          stats.completed_rooms++;
        }
      }
    }

    // --- 3. Delete old completed rooms ---
    const deleteCutoff = new Date(Date.now() - COMPLETED_RETENTION_HOURS * 3600 * 1000).toISOString();
    try {
      const { data: oldRooms } = await supabase
        .from("rooms")
        .select("room_id")
        .eq("status", "completed")
        .lt("completed_at", deleteCutoff);

      if (oldRooms && oldRooms.length > 0) {
        for (const room of oldRooms) {
          // Delete memberships first (no FK cascade assumed)
          const { count: memberCount } = await supabase
            .from("room_memberships")
            .delete()
            .eq("room_id", room.room_id)
            .select("user_id", { count: "exact", head: true });
          stats.deleted_memberships += (memberCount ?? 0);

          const { error } = await supabase
            .from("rooms")
            .delete()
            .eq("room_id", room.room_id);
          if (!error) stats.deleted_rooms++;
        }
      }
    } catch {
      // completed_at column may not exist; skip deletion of old rooms
    }

    return json({ ok: true, ...stats });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function updateCompatible(supabase: any, table: string, row: Record<string, unknown>, where: (query: any) => any) {
  return mutateCompatible(row, (payload) => where(supabase.from(table).update(payload)).select().single());
}

async function mutateCompatible(row: Record<string, unknown>, run: (payload: Record<string, unknown>) => Promise<any>) {
  let payload = { ...row };
  const removed = new Set<string>();
  for (;;) {
    const { data, error } = await run(payload);
    if (!error) return data;
    const missing = missingColumn(error);
    if (!missing || removed.has(missing) || !(missing in payload)) throw error;
    removed.add(missing);
    delete payload[missing];
  }
}

function missingColumn(error: any) {
  if (error?.code !== "PGRST204") return null;
  const match = /'([^']+)' column/.exec(error.message ?? "");
  return match?.[1] ?? null;
}
