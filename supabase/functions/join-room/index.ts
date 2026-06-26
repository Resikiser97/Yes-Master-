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

    const room = await getRoomCompatible(supabase, room_id);
    if (!room) return json({ error: "room not found or inactive" }, 404);
    if (room.game_started === true) return json({ error: "遊戲已開始" }, 403);

    const passwordText = typeof password === "string" ? password.trim() : "";
    if (room.password_hash) {
      const inputHash = passwordText ? await hashRoomPassword(room_id, passwordText) : null;
      if (room.password_hash !== inputHash) return json({ error: "密碼錯誤" }, 403);
    } else if (room.password && room.password !== passwordText) {
      return json({ error: "密碼錯誤" }, 403);
    }

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

    return json({
      membership,
      room: publicRoom({ ...room, current_players: currentPlayers ?? 1 }),
    });
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

async function getRoomCompatible(supabase: any, roomId: string) {
  const columns = ["room_id", "status", "max_players", "min_level", "password_hash", "password", "game_started", "visibility"];
  let selected = columns;
  const removed = new Set<string>();
  for (;;) {
    const { data, error } = await supabase
      .from("rooms")
      .select(selected.join(","))
      .eq("room_id", roomId)
      .eq("status", "active")
      .single();
    if (!error) return data;
    if (error.code === "PGRST116") return null;
    const missing = missingColumn(error) ?? selected.find((column) => (error.message ?? "").includes(column));
    if (!missing || removed.has(missing) || !selected.includes(missing)) throw error;
    removed.add(missing);
    selected = selected.filter((column) => column !== missing);
  }
}

async function hashRoomPassword(roomId: string, password: string) {
  const secret = Deno.env.get("ROOM_PASSWORD_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${roomId}:${password}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function publicRoom(room: Record<string, unknown>) {
  const { password, password_hash, ...safe } = room;
  return safe;
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
