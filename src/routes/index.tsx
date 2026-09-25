import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Folder, GitBranch, Search, Settings, TerminalSquare, Cpu } from "lucide-react";
import { Pm2Plugin } from "@/components/pm2/Pm2Plugin";
import { createMockAdapter, type MockScenario } from "@/lib/pm2/mock-adapter";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PM2 Plugin — Zync Workspace Prototype" },
      { name: "description", content: "Interactive prototype of the Zync PM2 plugin: monitor, manage and tail logs of PM2 processes on a remote server." },
      { property: "og:title", content: "PM2 Plugin — Zync Workspace Prototype" },
      { property: "og:description", content: "Monitor and manage remote PM2 processes from inside the Zync workspace pane." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Workspace,
});

const SCENARIOS: { id: MockScenario; label: string }[] = [
  { id: "normal", label: "PM2 available" },
  { id: "slow", label: "Slow connection" },
  { id: "empty", label: "No processes" },
  { id: "not-installed", label: "PM2 not installed" },
  { id: "ssh-down", label: "SSH unavailable" },
  { id: "action-failures", label: "Commands fail" },
];

const WIDTHS = [
  { label: "Narrow", px: 380 },
  { label: "Medium", px: 640 },
  { label: "Wide", px: 1180 },
];

function Workspace() {
  const [scenario, setScenario] = useState<MockScenario>("normal");
  const [paneWidth, setPaneWidth] = useState(640);
  const [nonce, setNonce] = useState(0);
  const adapter = useMemo(() => createMockAdapter(scenario), [scenario, nonce]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Prototype controls (not part of the plugin) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card px-3 py-2 text-xs">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">prototype controls</span>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Server state</span>
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value as MockScenario)}
            className="h-7 rounded-md border border-input bg-background px-2"
          >
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <button onClick={() => setNonce((n) => n + 1)} className="h-7 rounded-md border border-border px-2 hover:bg-accent">Reopen plugin</button>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Pane width</span>
          {WIDTHS.map((w) => (
            <button
              key={w.label}
              onClick={() => setPaneWidth(w.px)}
              className={cn("h-7 rounded-md border px-2", paneWidth === w.px ? "border-primary text-primary" : "border-border hover:bg-accent")}
            >
              {w.label}
            </button>
          ))}
          <input type="range" min={320} max={1400} value={paneWidth} onChange={(e) => setPaneWidth(+e.target.value)} className="w-28 accent-[var(--color-primary)]" />
          <span className="w-12 font-mono text-muted-foreground">{paneWidth}px</span>
        </div>
      </div>

      {/* Mock Zync shell */}
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-11 shrink-0 flex-col items-center gap-3 border-r border-border bg-card py-3 text-muted-foreground">
          {[Folder, Search, GitBranch, TerminalSquare].map((I, i) => <I key={i} className="size-4" />)}
          <Cpu className="size-4 text-primary" />
          <Settings className="mt-auto size-4" />
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-8 items-center gap-3 border-b border-border px-3 font-mono text-[11px] text-muted-foreground">
            <span className="text-foreground">zync</span>
            <span>›</span>
            <span>deploy@prod-web-01</span>
          </div>
          <div className="flex min-h-0 flex-1">
            <div className="hidden min-w-[180px] flex-1 flex-col bg-background p-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground sm:flex">
              <span className="mb-2 text-[10.5px] uppercase tracking-wide">terminal</span>
              <span><span className="text-primary">deploy@prod-web-01</span>:~$ cd /srv/api</span>
              <span><span className="text-primary">deploy@prod-web-01</span>:/srv/api$ git pull</span>
              <span>Already up to date.</span>
              <span><span className="text-primary">deploy@prod-web-01</span>:/srv/api$ <span className="animate-pulse text-foreground">▌</span></span>
            </div>
            <aside
              className="flex min-w-0 shrink-0 flex-col border-l border-border"
              style={{ width: `min(${paneWidth}px, 100%)` }}
            >
              <div className="flex h-8 items-center gap-2 border-b border-border bg-card px-3 text-[11px]">
                <span className="rounded-t border-b-2 border-primary px-1 py-1.5 font-medium">PM2</span>
                <span className="px-1 text-muted-foreground">Docker</span>
                <span className="px-1 text-muted-foreground">Ports</span>
              </div>
              <div className="min-h-0 flex-1">
                <Pm2Plugin key={`${scenario}-${nonce}`} adapter={adapter} />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
