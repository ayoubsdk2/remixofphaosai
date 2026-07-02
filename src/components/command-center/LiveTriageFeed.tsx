import { motion } from "framer-motion";
import { Activity, Phone, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { scrubPII } from "@/lib/pii-scrubber";

const FEED_ITEMS = [
  { time: "14:32:08", type: "inbound", caller: "+1 (713) 555-0122", model: "MX-M365N", intent: "Service", error: "SC542", status: "AI Handling", priority: "P2" },
  { time: "14:31:45", type: "inbound", caller: "+1 (832) 555-0899", model: "BP-70C45", intent: "Toner", error: null, status: "AI Resolved", priority: "P3" },
  { time: "14:30:12", type: "outbound", caller: "+1 (281) 555-0433", model: "MX-B455W", intent: "Sales", error: null, status: "Transferred", priority: "P1" },
  { time: "14:28:56", type: "inbound", caller: "+1 (713) 555-0741", model: "MX-C304W", intent: "Service", error: "SC322", status: "AI Handling", priority: "P2" },
  { time: "14:27:33", type: "inbound", caller: "+1 (832) 555-0198", model: "MX-M905", intent: "Toner", error: null, status: "AI Resolved", priority: "P4" },
  { time: "14:25:10", type: "inbound", caller: "+1 (281) 555-0567", model: "BP-50C55", intent: "Service", error: "SC541", status: "Escalated", priority: "P1" },
];

export function LiveTriageFeed() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Activity size={24} className="text-primary" />
        <h2 className="text-xl font-bold text-foreground tracking-tight">Live Triage Feed</h2>
        <span className="ml-auto flex items-center gap-2 text-[10px] text-primary font-bold uppercase tracking-widest">
          <span className="w-2 h-2 bg-primary rounded-full animate-status-pulse" /> Real-time
        </span>
      </div>

      <div className="glass-card overflow-hidden overflow-x-auto">
        <table className="w-full text-left min-w-[700px]">
          <thead>
            <tr className="text-[10px] text-muted-foreground uppercase tracking-widest border-b border-border/30">
              <th className="p-4">Time</th>
              <th className="p-4">Direction</th>
              <th className="p-4">Caller</th>
              <th className="p-4">Model</th>
              <th className="p-4">Intent</th>
              <th className="p-4">Error</th>
              <th className="p-4">Status</th>
              <th className="p-4">Priority</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {FEED_ITEMS.map((item, i) => (
              <motion.tr
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="border-b border-border/20 hover:bg-primary/5 transition-colors"
              >
                <td className="p-4 font-mono text-muted-foreground text-xs">{item.time}</td>
                <td className="p-4">
                  {item.type === "inbound" ? (
                    <ArrowDownRight size={14} className="text-success" />
                  ) : (
                    <ArrowUpRight size={14} className="text-primary" />
                  )}
                </td>
                <td className="p-4 font-mono text-foreground">{scrubPII(item.caller)}</td>
                <td className="p-4 text-foreground font-medium">{item.model}</td>
                <td className="p-4">
                  <span className="px-2 py-1 bg-primary/10 border border-primary/20 rounded text-[10px] uppercase font-bold text-primary">
                    {item.intent}
                  </span>
                </td>
                <td className="p-4 font-mono text-xs text-warning">{item.error || "—"}</td>
                <td className="p-4">
                  <span className={`text-xs font-medium ${
                    item.status === "AI Resolved" ? "text-success" :
                    item.status === "Escalated" ? "text-destructive" : "text-foreground"
                  }`}>{item.status}</span>
                </td>
                <td className="p-4">
                  <span className={`text-[10px] font-bold ${
                    item.priority === "P1" ? "text-destructive" :
                    item.priority === "P2" ? "text-warning" : "text-muted-foreground"
                  }`}>{item.priority}</span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
