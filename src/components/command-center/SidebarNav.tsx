import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  LayoutDashboard, Activity, PlayCircle,
  Database, ShieldCheck, BarChart3, Workflow, PhoneIncoming, MessageSquareText, Users,
  Smartphone, Menu, X,
} from "lucide-react";
import phaosLogo from "@/assets/phaos-logo.png";
import { useIsMobile } from "@/hooks/use-mobile";

const NAV_ITEMS = [
  { id: "Dashboard", icon: LayoutDashboard, label: "Global Dashboard" },
  // Triage Feed merged into Global Dashboard
  // DNA tab temporarily hidden
  { id: "Workflows", icon: Workflow, label: "Agent Workflows" },
  { id: "CallHistory", icon: PhoneIncoming, label: "Call Transcript" },
  // System Prompt temporarily hidden
  { id: "Sandbox", icon: PlayCircle, label: "The Sandbox" },
  { id: "Leads", icon: Users, label: "Lead Intelligence" },
  { id: "ERP", icon: Database, label: "Integrations" },
  { id: "Compliance", icon: ShieldCheck, label: "Ironclad Compliance" },
  { id: "Analytics", icon: BarChart3, label: "Analytics & ROI" },
  { id: "SoaApp", icon: Smartphone, label: "SOA AI App" },
];

interface SidebarNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function SidebarNav({ activeTab, onTabChange }: SidebarNavProps) {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (id: string) => {
    onTabChange(id);
    if (isMobile) setMobileOpen(false);
  };

  const navContent = (
    <>
      <div className="flex items-center gap-3 px-3 mb-8">
        <img src={phaosLogo} alt="Phaos AI logo" className="h-[36px] w-auto drop-shadow-[0_0_12px_hsl(var(--primary)/0.5)]" />
        <div className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-foreground font-extrabold text-2xl tracking-tight">PHAOS</span>
          <span className="text-primary font-bold text-2xl italic tracking-tight">AI</span>
        </div>
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Close navigation">
            <X size={22} />
          </button>
        )}
      </div>

      <nav className="space-y-0.5 flex-1 overflow-y-auto custom-scrollbar">
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                active
                  ? "bg-primary/10 text-foreground border-glow"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              <item.icon size={20} className={active ? "text-primary" : "group-hover:text-foreground"} />
              <span className="text-base font-medium tracking-tight">{item.label}</span>
              {active && (
                <motion.div layoutId="activeNav" className="ml-auto w-1 h-4 bg-gradient-phaos rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto p-4 glass-card">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-muted-foreground mb-1.5">
          <span className="w-2 h-2 bg-primary rounded-full animate-status-pulse" /> System Operational
        </div>
        <div className="text-xs font-mono text-muted-foreground">v4.2.0-enterprise</div>
      </div>
    </>
  );

  // Desktop sidebar
  if (!isMobile) {
    return (
      <aside className="w-72 border-r border-border/30 flex flex-col p-4 z-20 bg-background shrink-0" role="navigation" aria-label="Main navigation">
        {navContent}
      </aside>
    );
  }

  // Mobile: hamburger trigger + overlay drawer
  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-background/80 backdrop-blur border border-border/30 text-foreground"
        aria-label="Open navigation menu"
      >
        <Menu size={22} />
      </button>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed top-0 left-0 h-full w-80 z-50 bg-background border-r border-border/30 flex flex-col p-4 overflow-hidden"
              role="navigation"
              aria-label="Main navigation"
            >
              {navContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
