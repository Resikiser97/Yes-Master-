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

    const { room_id, password } = await req.json();
    if (!room_id) return json({ error: "missing room_id" }, 400);

    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("room_id,status,max_players,min_level,password")
      .eq("room_id", room_id)
      .eq("status", "active")
      .single();
    if (roomErr || !room) return json({ error: "room not found or inactive" }, 404);

    if (room.password && room.password !== password) return json({ error: "密碼錯誤" }, 403);

    const profile = await getPlayerProfile(supabase, user.id);
    const minLevel = Number(room.min_level ?? 0);
    if (minLevel > 0 && profile.level < minLevel) return json({ error: "等級不足" }, 403);

    const { data: existing } = await supabase
      .from("room_memberships")
      .select("slot_id,join_order,role,is_host")
      .eq("room_id", room_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      const { count, error: countErr } = await supabase
        .from("room_memberships")
        .select("user_id", { count: "exact", head: true })
        .eq("room_id", room_id);
      if (countErr) throw countErr;
      if ((count ?? 0) >= Number(room.max_players ?? 4)) return json({ error: "房間已滿" }, 403);
    }

    const { data: latestMember } = await supabase
      .from("room_memberships")
      .select("join_order")
      .eq("room_id", room_id)
      .order("join_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const joinOrder = existing?.join_order ?? ((latestMember?.join_order ?? 0) + 1);
    const slotId = existing?.slot_id ?? `p${joinOrder + 1}`;

    const membership = await upsertCompatible(supabase, "room_memberships", {
      room_id,
      user_id: user.id,
      slot_id: slotId,
      role: existing?.role ?? (existing?.is_host ? "host" : "player"),
      is_host: existing?.is_host ?? false,
      join_order: joinOrder,
      display_name: profile.display_name,
      player_level: profile.level,
      online: true,
      disconnected_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "room_id,user_id" });

    const { count: currentPlayers, error: currentPlayersErr } = await supabase
      .from("room_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("room_id", room_id);
    if (currentPlayersErr) throw currentPlayersErr;
    await updateCompatible(
      supabase,
      "rooms",
      { current_players: currentPlayers ?? 1 },
      (query: any) => query.eq("room_id", room_id),
    );

    return json({ membership });
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

async function upsertCompatible(supabase: any, table: string, row: Record<string, unknown>, options: Record<string, unknown>) {
  return mutateCompatible(row, (payload) => supabase.from(table).upsert(payload, options).select().single());
}

async function updateCompatible(supabase: any, table: string, row: Record<string, unknown>, where: (query: any) => any) {
  return mutateCompatible(row, (payload) => where(supabase.from(table).update(payload)).select().single());
}

async function getPlayerProfile(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("player_profiles")
    .select("display_name,level")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return {
    display_name: data?.display_name ?? "Goblin",
    level: data?.level ?? 1,
  };
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
