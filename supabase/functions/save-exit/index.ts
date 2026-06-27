/**
 * save-exit Edge Function
 * Converts the active room save into a formal save_files slot, then completes the room.
 *
 * Only the current room host (current_host_uid) may call this while the room is active.
 * Uses optimistic locking via data_revision to prevent saving a stale active_saves row.
 *
 * POST body: { room_id: string, slot: 1 | 2 | 3, data_revision: string }
 *
 * @version v0.0.17.0
 *
 * Responses:
 *   200 { ok: true, save_file_id: string }
 *   400 missing/invalid fields
 *   401 unauthorized
 *   403 not current host
 *   404 room not found | active save not found
 *   409 room not active | { error: "revision_conflict", latest_revision: string }
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

    const { room_id, slot, data_revision: clientRevision } = await req.json();
    const saveSlot = Number(slot);
    if (!room_id || !clientRevision || !Number.isInteger(saveSlot) || saveSlot < 1 || saveSlot > 3) {
      return json({ error: "missing or invalid room_id, slot, or data_revision" }, 400);
    }

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

    // Step 2: Read active save and check optimistic lock
    const { data: activeSave, error: activeErr } = await supabase
      .from("active_saves")
      .select("data, schema_version, data_revision")
      .eq("room_id", room_id)
      .maybeSingle();
    if (activeErr) throw activeErr;
    if (!activeSave) return json({ error: "active save not found" }, 404);

    const dbTs = new Date(activeSave.data_revision).getTime();
    const sentTs = new Date(clientRevision).getTime();
    if (sentTs !== dbTs) {
      return json({ error: "revision_conflict", latest_revision: activeSave.data_revision }, 409);
    }

    // Step 3: Upsert formal save slot
    const now = new Date().toISOString();
    const { data: saveFile, error: upsertErr } = await supabase
      .from("save_files")
      .upsert(
        {
          owner_id: user.id,
          room_id,
          slot: saveSlot,
          data: activeSave.data,
          schema_version: activeSave.schema_version ?? 1,
          data_revision: now,
          updated_at: now,
        },
        { onConflict: "owner_id,slot" },
      )
      .select("id")
      .single();
    if (upsertErr) throw upsertErr;

    // Step 4: Complete room and remove active save
    const { error: roomUpdateErr } = await supabase
      .from("rooms")
      .update({ status: "completed", completed_at: now })
      .eq("room_id", room_id);
    if (roomUpdateErr) throw roomUpdateErr;

    const { error: deleteErr } = await supabase
      .from("active_saves")
      .delete()
      .eq("room_id", room_id);
    if (deleteErr) throw deleteErr;

    return json({ ok: true, save_file_id: saveFile.id });
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
