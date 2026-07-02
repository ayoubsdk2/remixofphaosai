import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "phaos-compliance-settings";

interface ComplianceSettings {
  hipaa: boolean;
  pci: boolean;
  tcpa: boolean;
  retention: string;
  callRecordingConsent: boolean;
  gdprMinimization: boolean;
  adaAccessibility: boolean;
  optOutHandling: boolean;
  auditTrailLogging: boolean;
  piiScrubbing: boolean;
  promptInjectionDefense: boolean;
}

const DEFAULTS: ComplianceSettings = {
  hipaa: true, pci: true, tcpa: false, retention: "30d",
  callRecordingConsent: true, gdprMinimization: false,
  adaAccessibility: false, optOutHandling: true, auditTrailLogging: true,
  piiScrubbing: true, promptInjectionDefense: false,
};

function load(): ComplianceSettings {
  try { const s = localStorage.getItem(STORAGE_KEY); return s ? { ...DEFAULTS, ...JSON.parse(s) } : DEFAULTS; }
  catch { return DEFAULTS; }
}

const CARDS: { title: string; description: string; field: keyof ComplianceSettings }[] = [
  { title: "HIPAA / PHI Redaction", description: "Real-time transcript redaction masking patient names, addresses, and PHI from voice logs.", field: "hipaa" },
  { title: "PCI-DSS Billing", description: "Auto-pause recording when credit card or payment info is detected.", field: "pci" },
  { title: "TCPA Compliance", description: "Require explicit verbal SMS opt-in before sending messages.", field: "tcpa" },
  { title: "Call Recording Consent", description: "Announce recording disclaimer at the start of every call.", field: "callRecordingConsent" },
  { title: "GDPR Data Minimization", description: "Limit data collection to what is strictly necessary.", field: "gdprMinimization" },
  { title: "ADA Accessibility", description: "Slower speech, clearer enunciation, simplified vocabulary.", field: "adaAccessibility" },
  { title: "Opt-Out Handling", description: "Halt processing if caller says 'stop', 'opt out', or 'remove me'.", field: "optOutHandling" },
  { title: "Audit Trail Logging", description: "Log all compliance events with timestamps and caller IDs.", field: "auditTrailLogging" },
  { title: "PII Scrubbing at Transit", description: "Strip personally identifiable information before data leaves the voice pipeline.", field: "piiScrubbing" },
  { title: "Prompt Injection Defense", description: "LLM guardrails to detect and block adversarial prompt manipulation.", field: "promptInjectionDefense" },
];

export function ComplianceHub() {
  const [settings, setSettings] = useState<ComplianceSettings>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const update = <K extends keyof ComplianceSettings>(key: K, val: ComplianceSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
    toast.success("Compliance setting updated");
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <ShieldCheck size={24} className="text-primary" />
        <h2 className="text-xl font-bold text-foreground tracking-tight">Ironclad Compliance</h2>
      </div>

      {/* Disclaimer */}
      <div className="glass-card p-4 border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.05)]">
        <div className="flex items-start gap-3">
          <Info size={18} className="text-[hsl(var(--warning))] shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Regulatory Disclaimer:</strong> These controls configure AI compliance-supporting behavior. Full compliance requires organizational policies, legal counsel, and certified infrastructure.
          </p>
        </div>
      </div>

      {/* 4-col grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {CARDS.map((card) => {
          const active = settings[card.field] as boolean;
          return (
            <div key={card.field} className="glass-card p-5 space-y-3 hover-lift">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-widest leading-tight">{card.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
              <div className="flex items-center justify-between">
                <Switch checked={active} onCheckedChange={(v) => update(card.field, v)} aria-label={`Toggle ${card.title}`} />
                {active ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--success))]">
                    <ShieldCheck size={12} /> ACTIVE
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <AlertTriangle size={12} /> INACTIVE
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* SOC2 Retention */}
        <div className="glass-card p-5 space-y-3 hover-lift md:col-span-2">
          <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">SOC2 Data Retention</h3>
          <p className="text-xs text-muted-foreground">Auto-delete voice recordings and transcript logs.</p>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5 block">Auto-Delete After</label>
            <Select value={settings.retention} onValueChange={(v) => update("retention", v)}>
              <SelectTrigger className="bg-secondary/50 border-border/50 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24 Hours</SelectItem>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="90d">90 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
