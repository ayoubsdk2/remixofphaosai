import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Shield } from "lucide-react";

const NAV_ITEMS_SEARCHABLE = [
  { id: "Dashboard", keywords: ["dashboard", "overview", "metrics", "home"] },
  { id: "Triage", keywords: ["triage", "live", "feed", "calls", "active"] },
  { id: "DNA", keywords: ["dna", "persona", "agentic", "ai", "voice", "parameters"] },
  { id: "Workflows", keywords: ["workflows", "agent", "canvas", "nodes", "automation"] },
  { id: "CallHistory", keywords: ["call", "history", "calls", "past", "log"] },
  { id: "Prompt", keywords: ["prompt", "system", "instructions", "persona"] },
  { id: "Sandbox", keywords: ["sandbox", "test", "call", "phoebe", "voice", "ai call"] },
  { id: "Leads", keywords: ["leads", "customers", "intelligence", "quote", "sales"] },
  { id: "ERP", keywords: ["erp", "integrations", "eautomate", "sales chain", "zapier", "hubspot"] },
  { id: "Compliance", keywords: ["compliance", "hipaa", "pci", "tcpa", "gdpr", "security"] },
  { id: "Analytics", keywords: ["analytics", "roi", "metrics", "performance", "savings"] },
];

interface TopHeaderProps {
  onNavigate?: (tabId: string) => void;
}

export function TopHeader({ onNavigate }: TopHeaderProps) {
  const [uptime, setUptime] = useState(100);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setUptime((prev) => {
        const jitter = (Math.random() - 0.3) * 0.4;
        return Math.min(100, Math.max(99.5, prev + jitter));
      });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const healthColor = useMemo(() => {
    if (uptime >= 99.9) return "text-accent";
    if (uptime >= 99.5) return "text-primary";
    return "text-yellow-400";
  }, [uptime]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return NAV_ITEMS_SEARCHABLE.filter(
      (item) =>
        item.id.toLowerCase().includes(q) ||
        item.keywords.some((kw) => kw.includes(q))
    );
  }, [searchQuery]);

  const handleSelectResult = useCallback(
    (tabId: string) => {
      onNavigate?.(tabId);
      setSearchQuery("");
      setSearchFocused(false);
    },
    [onNavigate]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && searchResults.length > 0) {
        handleSelectResult(searchResults[0].id);
      }
      if (e.key === "Escape") {
        setSearchQuery("");
        setSearchFocused(false);
        (e.target as HTMLInputElement).blur();
      }
    },
    [searchResults, handleSelectResult]
  );

  return (
    <header className="h-14 md:h-16 border-b border-border/30 flex items-center justify-between px-4 md:px-8 bg-background/60 backdrop-blur-xl z-10 shrink-0">
      <div className="flex items-center gap-4 md:gap-6 flex-1 min-w-0">
        {/* Spacer for mobile hamburger */}
        <div className="w-8 md:hidden" />
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            placeholder="Search pages..."
            aria-label="Search pages and features"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            onKeyDown={handleKeyDown}
            className="bg-secondary/50 border border-border/50 rounded-full py-2 pl-10 pr-4 text-sm w-48 md:w-64 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all text-foreground placeholder:text-muted-foreground"
          />
          {/* Search results dropdown */}
          {searchFocused && searchResults.length > 0 && (
            <div className="absolute top-full left-0 mt-2 w-64 bg-card border border-border/50 rounded-lg shadow-xl overflow-hidden z-50">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  onMouseDown={() => handleSelectResult(result.id)}
                  className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
                >
                  <Search size={12} className="text-muted-foreground" />
                  {result.id === "CallHistory"
                    ? "Call History"
                    : result.id === "ERP"
                      ? "Integrations"
                      : result.id}
                </button>
              ))}
            </div>
          )}
          {searchFocused && searchQuery.trim() && searchResults.length === 0 && (
            <div className="absolute top-full left-0 mt-2 w-64 bg-card border border-border/50 rounded-lg shadow-xl z-50 px-4 py-3 text-sm text-muted-foreground">
              No results found
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 md:gap-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-accent rounded-full animate-status-pulse" />
          <span className="hidden sm:inline">Operational</span>
        </div>
        <div className="w-9 h-9 rounded-full bg-gradient-phaos border border-primary/30" />
      </div>
    </header>
  );
}
