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

    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const { room_id, peer_id } = await req.json();
    if (!room_id || !peer_id) return json({ error: "missing room_id or peer_id" }, 400);

    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("room_id,current_host_uid,status")
      .eq("room_id", room_id)
      .eq("status", "active")
      .single();
    if (roomErr || !room) return json({ error: "room not found or inactive" }, 404);
    if (room.current_host_uid && room.current_host_uid !== user.id) return json({ error: "not current host" }, 403);

    const updated = await updateCompatible(
      supabase,
      "rooms",
      { current_host_uid: user.id, current_host_peer_id: peer_id, status: "active" },
      (query: any) => query.eq("room_id", room_id),
    );

    return json(updated);
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
