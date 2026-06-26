import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const HEARTBEAT_TIMEOUT_SECONDS = 60;

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
    const { room_id } = await req.json();
    if (!room_id) return json({ error: "missing room_id" }, 400);

    // Verify user is a member of this room
    const { data: member, error: memberErr } = await supabase
      .from("room_memberships")
      .select("user_id")
      .eq("room_id", room_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberErr) throw memberErr;
    if (!member) return json({ error: "not a member of this room" }, 403);

    // Update membership presence
    await updateCompatible(
      supabase,
      "room_memberships",
      { online: true, disconnected_at: null, last_seen_at: new Date().toISOString() },
      (query: any) => query.eq("room_id", room_id).eq("user_id", user.id),
    );

    // Update room last_seen_at
    await updateCompatible(
      supabase,
      "rooms",
      { last_seen_at: new Date().toISOString() },
      (query: any) => query.eq("room_id", room_id),
    );

    // Recalculate current_players: only online members with recent last_seen_at
    const current_players = await refreshCurrentPlayersPresence(supabase, room_id);

    return json({ ok: true, current_players, room_closed: false });
  } catch (e) {
    const message = (e as Error).message;
    const status = message === "unauthorized" ? 401 : 500;
    return json({ error: message }, status);
  }
});

async function refreshCurrentPlayersPresence(supabase: any, roomId: string) {
  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_SECONDS * 1000).toISOString();

  // Count members that are online AND have recent last_seen_at
  // Fallback: if last_seen_at column doesn't exist, just count online members
  let current_players: number;
  try {
    const { count, error } = await supabase
      .from("room_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .eq("online", true)
      .gte("last_seen_at", cutoff);
    if (error) throw error;
    current_players = count ?? 0;
  } catch {
    // Fallback: count all online members (last_seen_at may not exist)
    const { count, error: fallbackErr } = await supabase
      .from("room_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .eq("online", true);
    if (fallbackErr) throw fallbackErr;
    current_players = count ?? 0;
  }

  await updateCompatible(
    supabase,
    "rooms",
    { current_players },
    (query: any) => query.eq("room_id", roomId),
  );
  return current_players;
}

async function requireUser(supabase: any, req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !user) throw new Error("unauthorized");
  return user;
}

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
