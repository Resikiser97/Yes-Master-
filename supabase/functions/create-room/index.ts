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

    const body = await req.json().catch(() => ({}));
    const room_id = body.room_id || crypto.randomUUID();
    const profile = await getPlayerProfile(supabase, user.id);
    const password = typeof body.password === "string" ? body.password.trim() : "";
    const password_hash = password ? await hashRoomPassword(room_id, password) : null;
    const room = await insertCompatible(supabase, "rooms", {
      room_id,
      owner_id: user.id,
      status: "active",
      current_host_uid: user.id,
      host_epoch: 1,
      name: body.name ?? "Room",
      max_players: body.max_players ?? 4,
      current_players: 1,
      password_hash,
      has_password: !!password_hash,
      min_level: body.min_level ?? 0,
      difficulty: body.difficulty ?? "normal",
      visibility: body.visibility ?? "public",
      game_started: false,
    });

    await upsertCompatible(supabase, "room_memberships", {
      room_id,
      user_id: user.id,
      slot_id: "p1",
      role: "host",
      is_host: true,
      join_order: 0,
      display_name: profile.display_name,
      player_level: profile.level,
      online: true,
      disconnected_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "room_id,user_id" });

    return json(publicRoom(room));
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

async function insertCompatible(supabase: any, table: string, row: Record<string, unknown>) {
  return mutateCompatible(row, (payload) => supabase.from(table).insert(payload).select().single());
}

async function upsertCompatible(supabase: any, table: string, row: Record<string, unknown>, options: Record<string, unknown>) {
  return mutateCompatible(row, (payload) => supabase.from(table).upsert(payload, options).select().single());
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
