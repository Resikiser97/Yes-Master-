/**
 * save-active Edge Function
 * Writes the current world state to active_saves for the given room.
 *
 * Only the current room host (current_host_uid) may call this.
 * Uses optimistic locking via data_revision to prevent concurrent overwrites.
 *
 * POST body: { room_id: string, data: object, schema_version?: number, data_revision?: string }
 *   - data_revision is the timestamp the client last received; omit on first write.
 *
 * Responses:
 *   200 { ok: true, data_revision: string }
 *   400 missing fields
 *   401 unauthorized
 *   403 not current host
 *   404 room not found
 *   409 room not active  |  { error: "revision_conflict", latest_revision: string }
 *   500 internal error
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const user = await requireUser(supabase, req);

    const { room_id, data, schema_version, data_revision: clientRevision } = await req.json();
    if (!room_id || !data) return json({ error: "missing room_id or data" }, 400);

    // Step 1: Verify caller is the active room's current host
    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("current_host_uid, status")
      .eq("room_id", room_id)
      .maybeSingle();
    if (roomErr) throw roomErr;
    if (!room) return json({ error: "room not found" }, 404);
    if (room.status !== "active") return json({ error: "room not active" }, 409);
    if (room.current_host_uid !== user.id) return json({ error: "not current host" }, 403);

    // Step 2: Optimistic lock — reject if client's revision doesn't match DB
    if (clientRevision) {
      const { data: existing, error: existErr } = await supabase
        .from("active_saves")
        .select("data_revision")
        .eq("room_id", room_id)
        .maybeSingle();
      if (existErr) throw existErr;

      if (existing) {
        const dbTs = new Date(existing.data_revision).getTime();
        const sentTs = new Date(clientRevision).getTime();
        if (sentTs !== dbTs) {
          return json({ error: "revision_conflict", latest_revision: existing.data_revision }, 409);
        }
      }
    }

    // Step 3: UPSERT active save (insert or overwrite by room_id PK)
    const now = new Date().toISOString();
    const { error: upsertErr } = await supabase
      .from("active_saves")
      .upsert(
        {
          room_id,
          data,
          schema_version: schema_version ?? 1,
          data_revision: now,
          updated_at: now,
        },
        { onConflict: "room_id" },
      );
    if (upsertErr) throw upsertErr;

    return json({ ok: true, data_revision: now });
  } catch (e) {
    const message = (e as Error).message;
    const status = message === "unauthorized" ? 401 : 500;
    return json({ error: message }, status);
  }
});

async function requireUser(supabase: any, req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: { user }, error } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (error || !user) throw new Error("unauthorized");
  return user;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
