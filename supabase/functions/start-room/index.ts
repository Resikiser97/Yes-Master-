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
    const { room_id } = await req.json();
    if (!room_id) return json({ error: "missing room_id" }, 400);

    const room = await requireHostRoom(supabase, room_id, user.id);
    const updated = await updateCompatible(
      supabase,
      "rooms",
      { game_started: true, status: "active" },
      (query: any) => query.eq("room_id", room.room_id),
    );

    return json({ ok: true, room: publicRoom(updated) });
  } catch (e) {
    const message = (e as Error).message;
    const status = message === "unauthorized" ? 401 : message === "room not found" ? 404 : message === "not current host" ? 403 : 500;
    return json({ error: message }, status);
  }
});

async function requireUser(supabase: any, req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !user) throw new Error("unauthorized");
  return user;
}

async function requireHostRoom(supabase: any, roomId: string, userId: string) {
  const { data: room, error } = await supabase
    .from("rooms")
    .select("room_id,current_host_uid,status")
    .eq("room_id", roomId)
    .eq("status", "active")
    .single();
  if (error || !room) throw new Error("room not found");
  if (room.current_host_uid !== userId) throw new Error("not current host");
  return room;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function publicRoom(room: Record<string, unknown>) {
  const { password, password_hash, ...safe } = room;
  return safe;
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
