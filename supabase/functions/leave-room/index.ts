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

    const { data: member, error: memberErr } = await supabase
      .from("room_memberships")
      .select("is_host")
      .eq("room_id", room_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberErr) throw memberErr;

    if (member?.is_host) {
      await updateCompatible(
        supabase,
        "rooms",
        { status: "completed", current_players: 0 },
        (query: any) => query.eq("room_id", room_id).eq("current_host_uid", user.id),
      );
      await supabase.from("room_memberships").delete().eq("room_id", room_id);
      return json({ ok: true, current_players: 0, room_closed: true });
    }

    const { error } = await supabase
      .from("room_memberships")
      .delete()
      .eq("room_id", room_id)
      .eq("user_id", user.id);
    if (error) throw error;

    const current_players = await refreshCurrentPlayers(supabase, room_id);
    return json({ ok: true, current_players });
  } catch (e) {
    const message = (e as Error).message;
    const status = message === "unauthorized" ? 401 : 500;
    return json({ error: message }, status);
  }
});

async function requireUser(supabase: any, req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !user) throw new Error("unauthorized");
  return user;
}

async function refreshCurrentPlayers(supabase: any, roomId: string) {
  const { count, error } = await supabase
    .from("room_memberships")
    .select("user_id", { count: "exact", head: true })
    .eq("room_id", roomId);
  if (error) throw error;
  const current_players = count ?? 0;
  await updateCompatible(supabase, "rooms", { current_players }, (query: any) => query.eq("room_id", roomId));
  return current_players;
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
