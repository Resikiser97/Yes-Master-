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

    // Verify caller via their JWT
    const authHeader = req.headers.get("Authorization")!;
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });

    const { room_id, join_type, slot_id } = await req.json();
    if (!room_id || !join_type) return new Response(JSON.stringify({ error: "missing room_id or join_type" }), { status: 400, headers: corsHeaders });

    // Check room exists and is active
    const { data: room, error: roomErr } = await supabase
      .from("rooms").select("*").eq("room_id", room_id).eq("status", "active").single();
    if (roomErr || !room) return new Response(JSON.stringify({ error: "room not found or inactive" }), { status: 404, headers: corsHeaders });

    // Check membership
    const { data: member } = await supabase
      .from("room_memberships").select("*").eq("room_id", room_id).eq("user_id", user.id).single();

    if (!member) return new Response(JSON.stringify({ error: "not a room member" }), { status: 403, headers: corsHeaders });
    if (join_type === "reconnect" && slot_id && member.slot_id !== slot_id) {
      return new Response(JSON.stringify({ error: "slot mismatch" }), { status: 403, headers: corsHeaders });
    }

    // Generate nonce and token
    const nonce = crypto.randomUUID();
    const exp = Date.now() + 90_000; // 90 seconds

    // Insert nonce (will be checked by verify function)
    const { error: nonceErr } = await supabase
      .from("consumed_nonces").insert({ nonce, consumed_at: null });
    if (nonceErr) return new Response(JSON.stringify({ error: "nonce insert failed" }), { status: 500, headers: corsHeaders });

    // Build token payload (signed by HMAC)
    const secret = Deno.env.get("ROOM_TOKEN_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const payload = { uid: user.id, room_id, slot_id: slot_id || null, join_type, exp, nonce };
    const payloadStr = JSON.stringify(payload);

    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadStr));
    const sigHex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");

    const token = btoa(JSON.stringify({ payload, sig: sigHex }));

    return new Response(JSON.stringify({ token }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
