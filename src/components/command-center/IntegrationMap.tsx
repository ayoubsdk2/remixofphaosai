import { motion } from "framer-motion";
import { useState, useMemo } from "react";
import { Database, CheckCircle2, Plug, Globe, Search, Calendar, ChevronDown, FileText } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type ToggleState = "off" | "pending" | "active";

interface IntegrationCard { name: string; desc: string; }
interface ErpMetric { label: string; value: string; tip: string; color: "green" | "yellow" | "red" | "blue"; }
interface ErpCard { name: string; desc: string; metrics: ErpMetric[]; }

const TIME_RANGES = ["This Week", "Last Week", "Last 30 Days", "Last 90 Days", "This Year", "Custom"];

const AVAILABLE_INTEGRATIONS: IntegrationCard[] = [
  { name: "Zapier", desc: "Connect 5,000+ apps via automated workflows" },
  { name: "HubSpot", desc: "Push leads and call logs directly into HubSpot CRM" },
  { name: "Salesforce", desc: "Enterprise CRM integration for lead injection" },
  { name: "Zendesk", desc: "Ticket management and support pipeline sync" },
  { name: "Slack", desc: "Real-time alerts and call summaries to channels" },
  { name: "Microsoft Teams", desc: "Team notifications and call activity feeds" },
  { name: "GoHighLevel", desc: "All-in-one marketing and CRM automation" },
  { name: "Twilio", desc: "SMS notifications and advanced telephony routing" },
  { name: "SendGrid", desc: "Transactional emails and campaign delivery" },
  { name: "QuickBooks", desc: "Automated invoice generation and billing" },
  { name: "DocuSign", desc: "E-signature workflows for contracts and leases" },
  { name: "PaperCut", desc: "Print management and cost tracking" },
  { name: "ConnectWise", desc: "IT service management and ticketing" },
  { name: "FreshService", desc: "IT help desk and service delivery" },
  { name: "ServiceNow", desc: "Enterprise service management platform" },
  { name: "Cal.com", desc: "Scheduling and appointment booking integration" },
];

const ERP_INTEGRATIONS: ErpCard[] = [
  {
    name: "Sales Chain", desc: "CRM lead injection for lease renewals, equipment upsells, and managed print proposals.",
    metrics: [
      { label: "Leads Injected", value: "847", tip: "Total leads pushed to Sales Chain CRM in the selected period", color: "green" },
      { label: "Conversion Rate", value: "34.2%", tip: "Percentage of injected leads that converted to signed deals", color: "green" },
      { label: "Pipeline Value", value: "$1.2M", tip: "Total estimated value of active pipeline opportunities", color: "blue" },
    ],
  },
  {
    name: "EAutomate (ECI)", desc: "Service dispatch, technician routing, van stock management, and contract billing.",
    metrics: [
      { label: "Dispatches / Mo", value: "2,418", tip: "Service calls dispatched via EAutomate this period", color: "blue" },
      { label: "Avg Response", value: "2.4h", tip: "Average time from ticket creation to technician arrival", color: "yellow" },
      { label: "First-Fix Rate", value: "78%", tip: "Percentage of service calls resolved on the first visit", color: "green" },
    ],
  },
  {
    name: "Sharp ODMS", desc: "Online Device Management System — fleet telemetry, meter reads, and supply alerts.",
    metrics: [
      { label: "Devices Monitored", value: "1,284", tip: "Active Sharp MFPs reporting telemetry to ODMS", color: "blue" },
      { label: "Avg Uptime", value: "99.7%", tip: "Average fleet uptime across all monitored devices", color: "green" },
      { label: "Auto-Orders / Mo", value: "312", tip: "Automatic supply orders triggered by low-toner alerts", color: "blue" },
    ],
  },
  {
    name: "Printanista", desc: "Managed print services platform — device monitoring, cost tracking, and fleet optimization.",
    metrics: [
      { label: "Fleet Devices", value: "3,650", tip: "Total devices under Printanista management", color: "blue" },
      { label: "Cost Savings", value: "22%", tip: "Reduction in print costs compared to previous quarter", color: "green" },
      { label: "Alerts / Day", value: "48", tip: "Average daily alerts for supply, jam, and service issues", color: "yellow" },
    ],
  },
  {
    name: "Remote Tech", desc: "Remote diagnostic and technician support platform for MFP troubleshooting.",
    metrics: [
      { label: "Remote Fixes", value: "612", tip: "Issues resolved remotely without dispatching a technician", color: "green" },
      { label: "Avg Resolution", value: "18min", tip: "Average time to resolve a remote diagnostic session", color: "green" },
      { label: "Escalation Rate", value: "11%", tip: "Percentage of remote sessions that required on-site escalation", color: "red" },
    ],
  },
  {
    name: "OneDrive", desc: "Cloud document storage — scan-to-cloud, document workflows, and archival integration.",
    metrics: [
      { label: "Docs Synced", value: "24.8K", tip: "Documents synced to OneDrive in the selected period", color: "blue" },
      { label: "Storage Used", value: "1.2TB", tip: "Total cloud storage consumed by synced documents", color: "yellow" },
      { label: "Active Users", value: "186", tip: "Users who accessed OneDrive-connected workflows", color: "blue" },
    ],
  },
];

const METRIC_COLORS: Record<string, string> = {
  green: "text-green-400",
  yellow: "text-yellow-400",
  red: "text-red-400",
  blue: "text-blue-400",
};

function IntegrationGrid({ items, title, icon: Icon }: { items: IntegrationCard[]; title: string; icon: typeof Plug }) {
  const [states, setStates] = useState<Record<string, ToggleState>>({});
  const [search, setSearch] = useState("");
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q));
  }, [items, search]);

  const cycleState = (name: string) => {
    setStates((prev) => {
      const current = prev[name] || "off";
      const next: ToggleState = current === "off" ? "pending" : current === "pending" ? "active" : "off";
      return { ...prev, [name]: next };
    });
  };

  const switchColor = (state: ToggleState) => {
    if (state === "active") return "data-[state=checked]:bg-[hsl(var(--success))]";
    if (state === "pending") return "data-[state=checked]:bg-yellow-500";
    return "";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-widest flex items-center gap-2">
          <Icon size={14} className="text-primary" /> {title}
        </h3>
        <div className="relative w-48">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="text-xs bg-secondary/30 border-border/30 h-7 pl-7" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {filtered.map((item) => {
          const state = states[item.name] || "off";
          const isHovered = hoveredCard === item.name;
          const showConfigure = state === "pending" || (state === "active" && isHovered);
          return (
            <div key={item.name} className="glass-card p-3 hover-lift flex flex-col justify-between gap-2" onMouseEnter={() => setHoveredCard(item.name)} onMouseLeave={() => setHoveredCard(null)}>
              <div>
                <p className="text-foreground font-bold text-xs">{item.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{item.desc}</p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Switch checked={state !== "off"} onCheckedChange={() => cycleState(item.name)} className={`scale-75 ${switchColor(state)}`} aria-label={`Toggle ${item.name}`} />
                  {state === "active" && <CheckCircle2 size={10} className="text-[hsl(var(--success))]" />}
                </div>
                {showConfigure && (
                  <button className="px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest border border-primary/30 text-primary rounded hover:bg-primary/10 transition-colors">
                    Configure
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ErpGrid({ timeRange }: { timeRange: string }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
        <Database size={14} className="text-primary" /> ERP & Industry
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ERP_INTEGRATIONS.map((item) => (
          <div key={item.name} className="glass-card p-5 hover-lift flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-foreground font-bold text-base">{item.name}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={true} className="data-[state=checked]:bg-[hsl(var(--success))]" aria-label={`${item.name} connected`} />
                <CheckCircle2 size={14} className="text-[hsl(var(--success))]" />
              </div>
            </div>
            <TooltipProvider>
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border/20">
                {item.metrics.map((m) => (
                  <Tooltip key={m.label}>
                    <TooltipTrigger asChild>
                      <div className="text-center cursor-help">
                        <p className={`text-2xl font-bold tabular-nums ${METRIC_COLORS[m.color]}`}>{m.value}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{m.label}</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs max-w-[220px]">{m.tip}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          </div>
        ))}
      </div>
    </div>
  );
}

export function IntegrationMap() {
  const [timeRange, setTimeRange] = useState("Last 30 Days");

  const handleGenerateReport = () => {
    toast.success("Report generation started", { description: `Generating platform metrics report for ${timeRange}...` });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
      <div className="flex items-center gap-3">
        <Plug size={24} className="text-primary" />
        <h2 className="text-xl font-bold text-foreground tracking-tight">Integrations</h2>
      </div>
      <ErpGrid timeRange={timeRange} />
      <IntegrationGrid items={AVAILABLE_INTEGRATIONS} title="Available Integrations" icon={Globe} />
    </motion.div>
  );
}
