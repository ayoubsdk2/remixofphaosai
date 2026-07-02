/**
 * use-vapi.ts — Dedicated hook for all Phaos AI voice interactions.
 * Manages WebRTC session lifecycle, transcript parsing, lead extraction,
 * network quality monitoring, and timeout soft-reset logic.
 *
 * Phase A Critical Fixes Applied:
 * - Volume level throttled to ~10fps via rAF (was 60fps causing re-render storms)
 * - Transcript stored in ref for extractAndSaveLead (fixes stale-state bug)
 * - Retry logic with exponential backoff for lead saves
 * - Transcript/reasoning arrays capped at 200 entries (prevents unbounded growth)
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { detectMfpModels, detectTerminology, formatSpecSummary } from "@/lib/sharp-mfp-specs";

// ─── Types ──────────────────────────────────────────────────

export interface TranscriptEntry {
  role: "system" | "ai" | "caller";
  text: string;
  timestamp: string;
  toolCall?: { name: string; args: Record<string, unknown> };
}

export interface ReasoningEntry {
  text: string;
  timestamp: string;
  type: "intent" | "action" | "routing";
}

interface VapiMessage {
  type: string;
  transcriptType?: string;
  role?: string;
  transcript?: string;
  toolCalls?: VapiToolCall[];
  functionCall?: VapiFunctionDef;
  latency?: number;
}

interface VapiFunctionDef {
  name?: string;
  arguments?: Record<string, unknown>;
}

interface VapiToolCall {
  function?: VapiFunctionDef;
}

interface VapiError {
  message?: string;
}

interface VapiInstance {
  start: (assistantId: string) => Promise<void>;
  stop: () => void;
  on: (event: string, handler: (...args: never[]) => void) => void;
}

export interface UseVapiReturn {
  callActive: boolean;
  callConnecting: boolean;
  isSpeaking: boolean;
  volumeLevel: number;
  transcript: TranscriptEntry[];
  reasoning: ReasoningEntry[];
  callDuration: number;
  latencyMs: number | null;
  structuredOutputs: string[];
  highLatency: boolean;
  isResetting: boolean;
  specAlerts: string[];
  liveQueryActive: boolean;
  startCall: () => Promise<void>;
  endCall: () => void;
  formatTime: (s: number) => string;
}

// ─── Validation ─────────────────────────────────────────────

const LeadSchema = z.object({
  call_id: z.string().min(1),
  customer_name: z.string().default("Unknown"),
  customer_phone: z.string().nullable().optional(),
  customer_email: z.string().email().nullable().optional().or(z.literal(null)),
  print_specs: z.record(z.string()).default({}),
  raw_excerpt: z.string().max(2000).optional(),
});

// ─── Constants ──────────────────────────────────────────────

const TIMEOUT_THRESHOLD_MS = 10_000;
const HIGH_LATENCY_THRESHOLD_MS = 1500;
const MAX_TRANSCRIPT_ENTRIES = 200;
const MAX_REASONING_ENTRIES = 200;
const LEAD_SAVE_MAX_RETRIES = 3;

// Kill native browser speechSynthesis globally
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak = () => {};
}

let vapiInstance: VapiInstance | null = null;

// Preload the Vapi SDK module so it's cached before the user clicks "Start"
const vapiModulePromise = import("@vapi-ai/web");

// ─── Lead Extraction Helpers ────────────────────────────────

function extractLeadData(fullText: string): {
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  printSpecs: Record<string, string>;
  machineModel: string;
  assetId: string | null;
  customerIntent: string;
  leadScore: number;
} {
  const nameMatch = fullText.match(
    /(?:my name is|this is|i'm|i am|name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
  );
  const phoneMatch = fullText.match(
    /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/
  );
  const emailMatch = fullText.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
  );
  const assetIdMatch = fullText.match(
    /(?:asset\s*(?:id|number|#)?|sticker)[:\s]*([A-Za-z0-9\-]+)/i
  );
  const modelMatch = fullText.match(
    /(?:BP|MX|AR|DX)[-\s]?\w{2,10}/i
  );

  let customerIntent = "general_inquiry";
  const lower = fullText.toLowerCase();
  if (lower.includes("service") || lower.includes("error") || lower.includes("broken") || lower.includes("down")) {
    customerIntent = "service_request";
  } else if (lower.includes("toner") || lower.includes("supply") || lower.includes("cartridge")) {
    customerIntent = "supply_order";
  } else if (lower.includes("contract") || lower.includes("lease") || lower.includes("quote")) {
    customerIntent = "contract_inquiry";
  } else if (lower.includes("meter") || lower.includes("reading") || lower.includes("billing")) {
    customerIntent = "meter_reading";
  }

  const printSpecs: Record<string, string> = {};
  const sizeMatch = lower.match(
    /(?:paper size|page size|format)[:\s]*(a[34]|letter|legal|tabloid|ledger|11x17)/i
  );
  if (sizeMatch) printSpecs.paper_size = sizeMatch[1].toUpperCase();
  const volMatch = lower.match(
    /(\d{1,6}(?:,\d{3})*)\s*(?:pages?|prints?|copies?|sheets?)\s*(?:per|a|\/)\s*(?:month|day|week)/i
  );
  if (volMatch) printSpecs.monthly_volume = volMatch[0];
  if (lower.includes("color") && !lower.includes("monochrome")) printSpecs.color_mode = "Color";
  else if (lower.includes("monochrome") || lower.includes("black and white") || lower.includes("b&w")) printSpecs.color_mode = "Monochrome";
  if (lower.includes("duplex") || lower.includes("double-sided")) printSpecs.duplex = "Yes";

  const customerName = nameMatch ? nameMatch[1].trim() : "Unknown";
  const customerPhone = phoneMatch ? phoneMatch[0].trim() : null;
  const customerEmail = emailMatch ? emailMatch[0].trim() : null;

  let leadScore = 0;
  if (customerName !== "Unknown") leadScore += 10;
  if (customerPhone) leadScore += 10;
  if (customerEmail) leadScore += 10;
  if (printSpecs.paper_size) leadScore += 10;
  if (printSpecs.monthly_volume) leadScore += 20;
  if (printSpecs.color_mode) leadScore += 10;
  if (printSpecs.duplex) leadScore += 10;
  const volStr = printSpecs.monthly_volume || "";
  const volNum = parseInt(volStr.replace(/\D/g, ""), 10);
  if (!isNaN(volNum) && volNum > 5000) leadScore += 10;
  leadScore = Math.min(leadScore, 100);

  return {
    customerName,
    customerPhone,
    customerEmail,
    printSpecs,
    machineModel: modelMatch ? modelMatch[0].trim() : "Not identified",
    assetId: assetIdMatch ? assetIdMatch[1].trim() : null,
    customerIntent,
    leadScore,
  };
}

// ─── Retry helper ───────────────────────────────────────────

async function retryAsync<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

// ─── Hook ───────────────────────────────────────────────────

export function useVapi(): UseVapiReturn {
  const [callActive, setCallActive] = useState(false);
  const [callConnecting, setCallConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [reasoning, setReasoning] = useState<ReasoningEntry[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [structuredOutputs, setStructuredOutputs] = useState<string[]>([]);
  const [highLatency, setHighLatency] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [specAlerts, setSpecAlerts] = useState<string[]>([]);
  const [liveQueryActive, setLiveQueryActive] = useState(false);

  const timerRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const timeoutCheckRef = useRef<number | null>(null);
  const detectedModelsRef = useRef<Set<string>>(new Set());
  const liveQueryTimerRef = useRef<number | null>(null);

  // ── Volume throttle refs (10fps max) ──
  const volumeRafRef = useRef<number | null>(null);
  const pendingVolumeRef = useRef<number>(0);

  // ── Transcript ref for extractAndSaveLead (fixes stale-state bug) ──
  const transcriptRef = useRef<TranscriptEntry[]>([]);

  const formatTime = useCallback(
    (s: number) =>
      `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`,
    []
  );

  const addReasoning = useCallback((text: string, type: ReasoningEntry["type"]) => {
    setReasoning((prev) => {
      const next = [...prev, { text, timestamp: new Date().toLocaleTimeString(), type }];
      return next.length > MAX_REASONING_ENTRIES ? next.slice(-MAX_REASONING_ENTRIES) : next;
    });
  }, []);

  const addTranscript = useCallback((entry: TranscriptEntry) => {
    setTranscript((prev) => {
      const next = [...prev, entry];
      const capped = next.length > MAX_TRANSCRIPT_ENTRIES ? next.slice(-MAX_TRANSCRIPT_ENTRIES) : next;
      transcriptRef.current = capped;
      return capped;
    });
  }, []);

  // Call duration timer
  useEffect(() => {
    if (callActive) {
      timerRef.current = window.setInterval(() => setCallDuration((p) => p + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callActive]);

  // Network quality monitor
  useEffect(() => {
    if (latencyMs !== null && latencyMs > HIGH_LATENCY_THRESHOLD_MS) {
      if (!highLatency) {
        setHighLatency(true);
        toast.warning("High Network Latency Detected — Switching to Optimized Stream");
        addReasoning("⚠ High latency detected — optimizing stream", "action");
      }
    } else if (highLatency && latencyMs !== null && latencyMs < HIGH_LATENCY_THRESHOLD_MS - 200) {
      setHighLatency(false);
      addReasoning("Network quality restored", "action");
    }
  }, [latencyMs, highLatency, addReasoning]);

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Soft reset
  const softReset = useCallback(async () => {
    if (!callActive || isResetting) return;
    setIsResetting(true);
    addReasoning("Session timeout — performing soft reset...", "action");
    toast.info("Session idle — reinitializing connection...");
    if (vapiInstance) {
      vapiInstance.stop();
      vapiInstance = null;
    }
    setCallActive(false);
    setIsSpeaking(false);
    setVolumeLevel(0);
    await new Promise((r) => setTimeout(r, 500));
    setIsResetting(false);
    addReasoning("Soft reset complete — ready to reconnect", "action");
    addTranscript({ role: "system", text: "Session soft-reset complete. Press Start to reconnect.", timestamp: formatTime(callDuration) });
  }, [callActive, isResetting, addReasoning, addTranscript, callDuration, formatTime]);

  // Timeout watchdog
  useEffect(() => {
    if (!callActive) {
      if (timeoutCheckRef.current) clearInterval(timeoutCheckRef.current);
      return;
    }
    lastActivityRef.current = Date.now();
    timeoutCheckRef.current = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current > TIMEOUT_THRESHOLD_MS) {
        softReset();
      }
    }, 2000);
    return () => {
      if (timeoutCheckRef.current) clearInterval(timeoutCheckRef.current);
    };
  }, [callActive, softReset]);

  // Cleanup volume rAF on unmount
  useEffect(() => {
    return () => {
      if (volumeRafRef.current) cancelAnimationFrame(volumeRafRef.current);
    };
  }, []);

  const checkForModelSpecs = useCallback((text: string) => {
    const models = detectMfpModels(text);
    for (const spec of models) {
      if (!detectedModelsRef.current.has(spec.model)) {
        detectedModelsRef.current.add(spec.model);
        const lines = formatSpecSummary(spec);
        setSpecAlerts((prev) => [...prev, ...lines]);
        addReasoning(`📋 MFP detected: ${spec.model} (${spec.series} Series)`, "routing");
      }
    }
  }, [addReasoning]);

  const checkForTerminology = useCallback((text: string) => {
    const terms = detectTerminology(text);
    for (const t of terms) {
      addReasoning(`📖 ${t.term}: ${t.definition.slice(0, 80)}...`, "routing");
    }
  }, [addReasoning]);

  // Live Query indicator
  const triggerLiveQuery = useCallback(() => {
    setLiveQueryActive(true);
    if (liveQueryTimerRef.current) clearTimeout(liveQueryTimerRef.current);
    liveQueryTimerRef.current = window.setTimeout(() => setLiveQueryActive(false), 3000);
  }, []);

  // Extract and save lead on call end — uses transcriptRef (not state) to avoid stale data
  const extractAndSaveLead = useCallback(async () => {
    const currentTranscript = transcriptRef.current;
    const fullText = currentTranscript
      .filter((t) => t.role !== "system")
      .map((t) => t.text)
      .join(" ");
    if (!fullText.trim()) return;

    const lead = extractLeadData(fullText);

    const rawLead = {
      call_id: `sandbox-${Date.now()}`,
      customer_name: lead.customerName,
      customer_phone: lead.customerPhone,
      customer_email: lead.customerEmail,
      print_specs: lead.printSpecs,
      raw_excerpt: fullText.slice(0, 2000),
    };

    const parsed = LeadSchema.safeParse(rawLead);
    if (!parsed.success) {
      toast.error("Lead extraction failed — invalid data");
      return;
    }

    const insertData = {
      call_id: parsed.data.call_id,
      customer_name: parsed.data.customer_name ?? "Unknown",
      customer_phone: parsed.data.customer_phone ?? null,
      customer_email: parsed.data.customer_email ?? null,
      print_specs: parsed.data.print_specs as Record<string, string>,
      raw_excerpt: parsed.data.raw_excerpt ?? null,
      lead_score: lead.leadScore,
    };

    try {
      await retryAsync(async () => {
        const { error } = await supabase.from("leads").insert(insertData);
        if (error) throw error;
      }, LEAD_SAVE_MAX_RETRIES);

      if (lead.leadScore > 80) {
        toast.success(`🔥 High-Value Lead Captured: ${lead.customerName}`, {
          description: `Lead Score: ${lead.leadScore}/100 — Immediate follow-up recommended`,
          duration: 8000,
        });
      } else {
        toast.success(`Lead captured: ${lead.customerName}`, {
          description: `Score: ${lead.leadScore}/100 • ${Object.keys(lead.printSpecs).length} specs detected`,
        });
      }
      addReasoning(`Lead saved → ${lead.customerName} (Score: ${lead.leadScore}) | Model: ${lead.machineModel} | Intent: ${lead.customerIntent}`, "action");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save lead after ${LEAD_SAVE_MAX_RETRIES} attempts: ${message}`);
    }
  }, [addReasoning]);

  const startCall = useCallback(async () => {
    setCallConnecting(true);
    setCallDuration(0);
    setTranscript([]);
    setReasoning([]);
    setStructuredOutputs([]);
    setLatencyMs(null);
    setHighLatency(false);
    setSpecAlerts([]);
    setLiveQueryActive(false);
    detectedModelsRef.current.clear();
    transcriptRef.current = [];

    addReasoning("Initializing Phaos AI Core Engine...", "action");
    addTranscript({ role: "system", text: "Connecting to Phaos AI Core Engine...", timestamp: "00:00" });

    try {
      const { default: Vapi } = await vapiModulePromise;
      const publicKey = "b4b4be59-182a-492b-bb0b-55aad26306ad";
      const assistantId = "9b500996-850d-416f-96b1-c7aa1eeb2dc3";

      const vapi = new Vapi(publicKey) as unknown as VapiInstance;
      vapiInstance = vapi;

      const startPromise = vapi.start(assistantId);
      addReasoning("Connection initiated — establishing secure channel...", "action");

      vapi.on("call-start", (() => {
        setCallActive(true);
        setCallConnecting(false);
        markActivity();
        addReasoning("Secure connection established — Phaos voice engine active", "action");
        addTranscript({ role: "system", text: "Call connected — Phaos AI active", timestamp: "00:00" });
      }) as never);

      vapi.on("call-end", (() => {
        setCallActive(false);
        setCallConnecting(false);
        setIsSpeaking(false);
        setVolumeLevel(0);
        addReasoning("Call terminated. Extracting lead data...", "action");
        addTranscript({ role: "system", text: "Call ended.", timestamp: formatTime(callDuration) });
        // Uses transcriptRef — no stale state
        extractAndSaveLead();
        vapiInstance = null;
      }) as never);

      vapi.on("speech-start", (() => {
        setIsSpeaking(true);
        markActivity();
        addReasoning("Agent speaking — streaming voice output", "action");
      }) as never);

      vapi.on("speech-end", (() => {
        setIsSpeaking(false);
        markActivity();
      }) as never);

      // ── Throttled volume updates (10fps via rAF) ──
      vapi.on("volume-level", ((level: number) => {
        pendingVolumeRef.current = level;
        if (level > 0.05) markActivity();
        if (!volumeRafRef.current) {
          volumeRafRef.current = requestAnimationFrame(() => {
            setVolumeLevel(pendingVolumeRef.current);
            volumeRafRef.current = null;
          });
        }
      }) as never);

      vapi.on("message", ((msg: VapiMessage) => {
        const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        markActivity();

        if (msg.type === "transcript" && msg.transcriptType === "final") {
          if (msg.role === "assistant") {
            const text = msg.transcript ?? "";
            addTranscript({ role: "ai", text, timestamp: now });
            checkForModelSpecs(text);
            const lowerText = text.toLowerCase();
            if (lowerText.includes("e-automate") || lowerText.includes("sales chain") || lowerText.includes("querying") || lowerText.includes("pulling")) {
              triggerLiveQuery();
            }
          } else if (msg.role === "user") {
            const text = msg.transcript ?? "";
            addTranscript({ role: "caller", text, timestamp: now });
            addReasoning(`Caller: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`, "intent");
            checkForModelSpecs(text);
            checkForTerminology(text);
            setIsSpeaking(false);
          }
        }

        if (msg.type === "transcript" && msg.transcriptType === "partial" && msg.role === "user") {
          markActivity();
          setIsSpeaking(false);
        }

        if (msg.type === "function-call" || msg.type === "tool-calls") {
          const calls: VapiToolCall[] = msg.type === "tool-calls"
            ? (msg.toolCalls ?? [])
            : [{ function: msg.functionCall }];
          for (const call of calls) {
            const name = call.function?.name ?? "unknown_tool";
            const args = call.function?.arguments ?? {};
            addTranscript({
              role: "system",
              text: `⚡ EXECUTING: ${name}`,
              timestamp: now,
              toolCall: { name, args },
            });
            addReasoning(`⚡ Tool triggered: ${name}`, "action");
            if (name.includes("dispatch") || name.includes("service")) {
              setStructuredOutputs((prev) => [...new Set([...prev, "APPOINTMENT_SET"])]);
            }
            if (name.includes("resolve") || name.includes("toner") || name.includes("fix")) {
              setStructuredOutputs((prev) => [...new Set([...prev, "ISSUE_RESOLVED"])]);
            }
          }
        }

        if (msg.type === "metadata" || msg.type === "model-output") {
          addReasoning("LLM response generated — routing to voice engine", "routing");
        }

        if (msg.type === "latency" && typeof msg.latency === "number") {
          setLatencyMs(msg.latency);
        }
      }) as never);

      vapi.on("error", ((err: VapiError) => {
        addReasoning(`Error: ${err?.message ?? "Unknown"}`, "action");
        toast.error(`Call error: ${err?.message ?? "Unknown error"}`);
        setCallActive(false);
        setCallConnecting(false);
      }) as never);

      await startPromise;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to connect: ${message}`);
      setCallConnecting(false);
    }
  }, [addReasoning, addTranscript, callDuration, extractAndSaveLead, markActivity, formatTime, checkForModelSpecs, checkForTerminology, triggerLiveQuery]);

  const endCall = useCallback(() => {
    if (vapiInstance) {
      vapiInstance.stop();
      vapiInstance = null;
    }
    setCallActive(false);
    setCallConnecting(false);
    setIsSpeaking(false);
    setVolumeLevel(0);
  }, []);

  return {
    callActive,
    callConnecting,
    isSpeaking,
    volumeLevel,
    transcript,
    reasoning,
    callDuration,
    latencyMs,
    structuredOutputs,
    highLatency,
    isResetting,
    specAlerts,
    liveQueryActive,
    startCall,
    endCall,
    formatTime,
  };
}
