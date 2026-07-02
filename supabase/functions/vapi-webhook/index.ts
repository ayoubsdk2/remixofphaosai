import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const eventType = payload.message?.type || payload.type;

    console.log("Vapi webhook received:", eventType);

    if (eventType === "end-of-call-report" || eventType === "call.ended") {
      const report = payload.message || payload;
      const transcript = report.transcript || report.artifact?.transcript || "";
      const summary = report.summary || report.analysis?.summary || "";
      const callId = report.call?.id || report.callId || "unknown";
      const duration = report.call?.duration || report.durationSeconds || 0;
      const endedReason = report.endedReason || report.call?.endedReason || "unknown";

      const transcriptText = typeof transcript === "string" ? transcript : JSON.stringify(transcript);

      // Parse structured data from transcript
      const machineModel = extractField(transcriptText, ["model", "machine", "device", "copier", "MFP"]) || "Not identified";
      const errorCode = extractField(transcriptText, ["error code", "error", "code", "E-"]) || "None";
      const resolved = summary.toLowerCase().includes("resolved") ||
        transcriptText.toLowerCase().includes("resolved") ||
        transcriptText.toLowerCase().includes("fixed");

      // Extract lead data from transcript
      const customerName = extractName(transcriptText);
      const customerPhone = extractPhone(transcriptText);
      const customerEmail = extractEmail(transcriptText);
      const printSpecs = extractPrintSpecs(transcriptText);

      // Calculate lead score based on print spec completeness
      const leadScore = calculateLeadScore(printSpecs, customerName, customerPhone, customerEmail);

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Insert into service_tickets
      const { error: dbError } = await supabase.from("service_tickets").insert({
        call_id: callId,
        transcript: transcriptText,
        summary,
        machine_model: machineModel,
        error_code: errorCode,
        resolution_status: resolved ? "resolved" : "pending",
        duration_seconds: duration,
        ended_reason: endedReason,
      });

      if (dbError) {
        console.error("DB insert error:", dbError);
      }

      // Insert into leads table with score
      const { error: leadError } = await supabase.from("leads").insert({
        call_id: callId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        print_specs: printSpecs,
        raw_excerpt: transcriptText.slice(0, 2000),
        lead_score: leadScore,
      });

      if (leadError) {
        console.error("Lead insert error:", leadError);
      }

      // Send email notification via Resend
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY) {
        try {
          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Phaos AI <onboarding@resend.dev>",
              to: ["service-manager@phaos-demo.com"],
              subject: `Service Brief: ${machineModel} — ${resolved ? "✅ Resolved" : "⚠️ Pending"}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 24px; border-radius: 12px;">
                  <h1 style="color: #a855f7; font-size: 20px;">Phaos AI — Technical Service Brief</h1>
                  <hr style="border-color: #333;" />
                  <table style="width: 100%; font-size: 14px; margin-top: 16px;">
                    <tr><td style="color: #999; padding: 8px 0;">Call ID</td><td>${callId}</td></tr>
                    <tr><td style="color: #999; padding: 8px 0;">Customer</td><td>${customerName}${customerPhone ? ` — ${customerPhone}` : ""}${customerEmail ? ` — ${customerEmail}` : ""}</td></tr>
                    <tr><td style="color: #999; padding: 8px 0;">Machine Model</td><td>${machineModel}</td></tr>
                    <tr><td style="color: #999; padding: 8px 0;">Error Code</td><td>${errorCode}</td></tr>
                    <tr><td style="color: #999; padding: 8px 0;">Resolution</td><td style="color: ${resolved ? "#22c55e" : "#eab308"};">${resolved ? "Resolved — Truck Roll Saved" : "Pending — Dispatch Required"}</td></tr>
                    <tr><td style="color: #999; padding: 8px 0;">Duration</td><td>${duration}s</td></tr>
                    <tr><td style="color: #999; padding: 8px 0;">Print Specs</td><td>${JSON.stringify(printSpecs)}</td></tr>
                  </table>
                  <h3 style="color: #a855f7; margin-top: 24px;">Summary</h3>
                  <p style="font-size: 13px; line-height: 1.6;">${summary || "No summary available."}</p>
                  <p style="font-size: 10px; color: #666; margin-top: 24px;">Generated by Phaos AI Neural Engine</p>
                </div>
              `,
            }),
          });
          const emailData = await emailResponse.json();
          console.log("Email sent:", emailData);
        } catch (emailErr) {
          console.error("Email send error:", emailErr);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message || "Webhook processing error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function calculateLeadScore(
  specs: Record<string, string>,
  name: string,
  phone: string | null,
  email: string | null
): number {
  let score = 0;
  // Contact completeness (max 30)
  if (name && name !== "Unknown") score += 10;
  if (phone) score += 10;
  if (email) score += 10;
  // Print spec completeness (max 70)
  if (specs.paper_size) score += 10;
  if (specs.monthly_volume) score += 20;
  if (specs.color_mode) score += 10;
  if (specs.duplex) score += 10;
  if (specs.speed_ppm) score += 10;
  // Bonus for high volume
  const volStr = specs.monthly_volume || "";
  const volNum = parseInt(volStr.replace(/\D/g, ""), 10);
  if (!isNaN(volNum) && volNum > 5000) score += 10;
  return Math.min(score, 100);
}

function extractField(text: string, keywords: string[]): string | null {
  if (!text || typeof text !== "string") return null;
  for (const keyword of keywords) {
    const regex = new RegExp(`${keyword}[:\\s]+([\\w\\-\\.]+)`, "i");
    const match = text.match(regex);
    if (match) return match[1];
  }
  return null;
}

function extractName(text: string): string {
  const patterns = [
    /(?:my name is|this is|i'm|i am|name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:speaking with|talking to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return "Unknown";
}

function extractPhone(text: string): string | null {
  const m = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  return m ? m[0].trim() : null;
}

function extractEmail(text: string): string | null {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].trim() : null;
}

function extractPrintSpecs(text: string): Record<string, string> {
  const specs: Record<string, string> = {};
  const lower = text.toLowerCase();

  const sizeMatch = lower.match(/(?:paper size|page size|format)[:\s]*(a[34]|letter|legal|tabloid|ledger|11x17)/i);
  if (sizeMatch) specs.paper_size = sizeMatch[1].toUpperCase();

  const volMatch = lower.match(/(\d{1,6}(?:,\d{3})*)\s*(?:pages?|prints?|copies?|sheets?)\s*(?:per|a|\/)\s*(?:month|day|week)/i);
  if (volMatch) specs.monthly_volume = volMatch[0];

  if (lower.includes("color") && !lower.includes("monochrome")) specs.color_mode = "Color";
  else if (lower.includes("monochrome") || lower.includes("black and white") || lower.includes("b&w")) specs.color_mode = "Monochrome";

  if (lower.includes("duplex") || lower.includes("double-sided") || lower.includes("two-sided")) specs.duplex = "Yes";

  const speedMatch = lower.match(/(\d{1,3})\s*(?:ppm|pages?\s*per\s*minute)/i);
  if (speedMatch) specs.speed_ppm = speedMatch[1];

  return specs;
}
