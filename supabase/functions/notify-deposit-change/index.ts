// Sends a WhatsApp notification via Twilio when a customer's deposit changes.
// Gracefully no-ops if Twilio isn't connected yet.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { customer_id, type, amount } = await req.json();
    if (!customer_id || !type || amount === undefined) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: customer } = await supabase
      .from("customers")
      .select("name, phone, customer_number, deposit_balance")
      .eq("id", customer_id)
      .single();

    if (!customer?.phone) {
      return new Response(JSON.stringify({ ok: true, skipped: "no phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    const TWILIO_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM"); // e.g. whatsapp:+14155238886

    if (!LOVABLE_API_KEY || !TWILIO_API_KEY || !TWILIO_FROM) {
      console.log("Twilio not configured, skipping notification", {
        hasLovable: !!LOVABLE_API_KEY, hasTwilio: !!TWILIO_API_KEY, hasFrom: !!TWILIO_FROM,
      });
      return new Response(JSON.stringify({ ok: true, skipped: "twilio not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const verb = type === "collected" ? "received" : type === "refunded" ? "refunded" : "adjusted";
    const body = `Hi ${customer.name}, your deposit of ₹${amount} has been ${verb}. New balance: ₹${customer.deposit_balance}. (${customer.customer_number})`;

    const to = customer.phone.startsWith("whatsapp:") ? customer.phone : `whatsapp:${customer.phone}`;

    const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }),
    });
    const out = await res.json();
    if (!res.ok) {
      console.error("Twilio error", res.status, out);
      return new Response(JSON.stringify({ ok: false, error: out }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, sid: out.sid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
