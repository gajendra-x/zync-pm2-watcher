import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Download,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  ServerOff,
  Square,
  Trash2,
  Unplug,
  X,
  XCircle,
  Boxes,
  Eye,
  EyeOff,
} from "lucide-react";
import type { Pm2Action, Pm2Adapter, Pm2Error, Pm2Process, Pm2Status } from "@/lib/pm2/types";
import { fmt, usePm2, type CommandEntry } from "@/lib/pm2/use-pm2";
import { LogViewer } from "./LogViewer";
import { cn } from "@/lib/utils";

type Filter = "all" | "online" | "stopped" | "errored";
type Tab = "overview" | "logs" | "env";

const ACTION_META: Record<Pm2Action, { label: string; icon: typeof Play; destructive?: boolean; confirm?: string }> = {
  start: { label: "Start", icon: Play },
  restart: { label: "Restart", icon: RotateCw },
  reload: { label: "Reload", icon: RotateCcw },
  stop: { label: "Stop", icon: Square, confirm: "The process will stop serving traffic until it is started again." },
  delete: { label: "Delete", icon: Trash2, destructive: true, confirm: "The process will be stopped and removed from the PM2 list. You will need its ecosystem file or start command to add it back." },
};

function actionsFor(p: Pm2Process): Pm2Action[] {
  return p.status === "online" || p.status === "launching" ? ["restart", "reload", "stop", "delete"] : ["start", "delete"];
}

function statusBucket(s: Pm2Status): Exclude<Filter, "all"> {
  return s === "online" || s === "launching" ? "online" : s === "errored" ? "errored" : "stopped";
}

export function Pm2Plugin({ adapter }: { adapter: Pm2Adapter }) {
  const pm2 = usePm2(adapter);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [confirm, setConfirm] = useState<{ p: Pm2Process; action: Pm2Action } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const procs = pm2.snapshot?.processes ?? [];
  const counts = useMemo(() => {
    const c = { all: procs.length, online: 0, stopped: 0, errored: 0 };
    procs.forEach((p) => c[statusBucket(p.status)]++);
    return c;
  }, [procs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return procs.filter((p) => {
      if (filter !== "all" && statusBucket(p.status) !== filter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || String(p.pmId) === q.replace(/^#/, "") || p.status.includes(q);
    });
  }, [procs, filter, query]);

  const selected = procs.find((p) => p.pmId === selectedId) ?? null;

  // Deselect when the process disappears (e.g. deleted)
  useEffect(() => {
    if (selectedId !== null && pm2.snapshot && !selected) {
      setSelectedId(null);
      setLogsExpanded(false);
    }
  }, [selectedId, selected, pm2.snapshot]);

  const request = (p: Pm2Process, action: Pm2Action) => {
    if (ACTION_META[action].confirm) setConfirm({ p, action });
    else pm2.run(p.pmId, action, p.name);
  };

  const openLogs = (p: Pm2Process) => {
    setSelectedId(p.pmId);
    setTab("logs");
  };

  // ---------- full-pane states ----------
  let body: React.ReactNode;
  const blocking = pm2.error && (pm2.error.code !== "COMMAND_FAILED" || !pm2.snapshot);

  if (pm2.initialLoading) {
    body = <LoadingState host={adapter.host} />;
  } else if (blocking && pm2.error) {
    body = pm2.error.code === "SSH_UNAVAILABLE" ? (
      <StateCard icon={Unplug} tone="destructive" title="Server not reachable" text={`Zync can't reach ${adapter.host}, so PM2 information can't be retrieved. Check the SSH connection for this workspace.`} error={pm2.error}>
        <Btn onClick={() => pm2.refresh(true)} busy={pm2.refreshing} icon={RefreshCw}>Retry connection</Btn>
      </StateCard>
    ) : pm2.error.code === "NOT_INSTALLED" ? (
      <StateCard icon={ServerOff} tone="warning" title="PM2 isn't installed on this server" text={`The pm2 command wasn't found on ${adapter.host}. Install it globally with npm to manage Node processes here.`} error={pm2.error}>
        <Btn primary onClick={pm2.install} busy={pm2.commands[0]?.command === "npm install -g pm2" && pm2.commands[0].state === "running"} icon={Download}>Install PM2</Btn>
        <Btn onClick={() => pm2.refresh(true)} busy={pm2.refreshing} icon={RefreshCw}>Check again</Btn>
      </StateCard>
    ) : (
      <StateCard icon={AlertTriangle} tone="destructive" title="Couldn't read PM2 state" text="The PM2 command failed." error={pm2.error}>
        <Btn onClick={() => pm2.refresh(true)} busy={pm2.refreshing} icon={RefreshCw}>Retry</Btn>
      </StateCard>
    );
  } else if (procs.length === 0) {
    body = (
      <StateCard icon={Boxes} tone="muted" title="No processes managed by PM2" text="PM2 is running on this server but has nothing in its process list. Start an app from the terminal to see it here.">
        <code className="rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-muted-foreground">pm2 start ecosystem.config.js</code>
        <Btn onClick={() => pm2.refresh(true)} busy={pm2.refreshing} icon={RefreshCw}>Refresh</Btn>
      </StateCard>
    );
  } else {
    body = (
      <div className="flex min-h-0 flex-1">
        {/* List */}
        <div className={cn("min-h-0 min-w-0 flex-1 flex-col", selected ? "hidden @4xl:flex @4xl:max-w-[48%] @6xl:max-w-[42%] @4xl:border-r @4xl:border-border" : "flex", logsExpanded && "@4xl:hidden")}>
          {!logsExpanded && (
            <>
              <SummaryStrip counts={counts} filter={filter} setFilter={setFilter} />
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter by name, id or status"
                    className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-7 text-xs outline-none focus:ring-1 focus:ring-ring"
                  />
                  {query && (
                    <button aria-label="Clear filter" onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <ProcessList
                procs={filtered}
                now={now}
                selectedId={selectedId}
                pending={pm2.pending}
                compact={!!selected}
                onSelect={(p) => {
                  setSelectedId(p.pmId);
                  if (tab === "logs" && selectedId === null) setTab("overview");
                }}
                onAction={request}
                onLogs={openLogs}
                emptyReset={() => {
                  setQuery("");
                  setFilter("all");
                }}
              />
            </>
          )}
        </div>
        {/* Detail */}
        {selected && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ProcessDetail
              key={selected.pmId}
              adapter={adapter}
              p={selected}
              now={now}
              tab={tab}
              setTab={setTab}
              pending={pm2.pending[selected.pmId]}
              onAction={request}
              onClose={() => {
                setSelectedId(null);
                setLogsExpanded(false);
              }}
              logsExpanded={logsExpanded}
              setLogsExpanded={setLogsExpanded}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="@container relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface text-foreground">
      <Header
        host={adapter.host}
        version={pm2.snapshot?.version}
        available={!pm2.error && !!pm2.snapshot}
        loading={pm2.initialLoading}
        error={pm2.error}
        refreshing={pm2.refreshing}
        paused={pm2.paused}
        lastUpdated={pm2.snapshot?.fetchedAt}
        now={now}
        onRefresh={() => pm2.refresh(true)}
        onTogglePause={() => pm2.setPaused(!pm2.paused)}
      />
      {pm2.error && !blocking && (
        <div className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">Last refresh failed: {pm2.error.message}. Showing data from {fmt.uptime(pm2.snapshot?.fetchedAt ?? null, now)} ago.</span>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
      <CommandTray commands={pm2.commands} onDismiss={pm2.dismissCmd} />
      {confirm && (
        <ConfirmDialog
          p={confirm.p}
          action={confirm.action}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            pm2.run(confirm.p.pmId, confirm.action, confirm.p.name);
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------- Header ----------------
function Header(props: {
  host: string;
  version?: string | undefined;
  available: boolean;
  loading: boolean;
  error: Pm2Error | null;
  refreshing: boolean;
  paused: boolean;
  lastUpdated?: number | undefined;
  now: number;
  onRefresh: () => void;
  onTogglePause: () => void;
}) {
  const state = props.loading
    ? { dot: "bg-muted-foreground animate-pulse", label: "connecting" }
    : props.error?.code === "SSH_UNAVAILABLE"
      ? { dot: "bg-destructive", label: "ssh offline" }
      : props.error?.code === "NOT_INSTALLED"
        ? { dot: "bg-warning", label: "pm2 missing" }
        : props.available
          ? { dot: "bg-success", label: `pm2 v${props.version}` }
          : { dot: "bg-destructive", label: "error" };
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">PM2</span>
        <span className="truncate font-mono text-xs text-muted-foreground">{props.host}</span>
        <span className="hidden items-center gap-1.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground @sm:flex">
          <span className={cn("size-1.5 rounded-full", state.dot)} />
          {state.label}
        </span>
      </div>
      {props.lastUpdated && (
        <span className="hidden whitespace-nowrap font-mono text-[10.5px] text-muted-foreground @xl:inline">
          {props.paused ? "auto-refresh paused" : `updated ${Math.max(0, Math.round((props.now - props.lastUpdated) / 1000))}s ago · every 3s`}
        </span>
      )}
      <button
        title={props.paused ? "Resume auto-refresh" : "Pause auto-refresh"}
        aria-label={props.paused ? "Resume auto-refresh" : "Pause auto-refresh"}
        onClick={props.onTogglePause}
        disabled={props.loading}
        className={cn("grid size-7 place-items-center rounded-md hover:bg-accent disabled:opacity-40", props.paused ? "text-warning" : "text-muted-foreground")}
      >
        {props.paused ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
      <button
        title="Refresh PM2 state"
        aria-label="Refresh PM2 state"
        onClick={props.onRefresh}
        disabled={props.loading || props.refreshing}
        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <RefreshCw className={cn("size-3.5", props.refreshing && "animate-spin")} />
      </button>
    </div>
  );
}

// ---------------- Summary ----------------
function SummaryStrip({ counts, filter, setFilter }: { counts: Record<Filter, number>; filter: Filter; setFilter: (f: Filter) => void }) {
  const items: { key: Filter; label: string; color: string }[] = [
    { key: "all", label: "Total", color: "text-foreground" },
    { key: "online", label: "Online", color: "text-success" },
    { key: "stopped", label: "Stopped", color: "text-muted-foreground" },
    { key: "errored", label: "Errored", color: "text-destructive" },
  ];
  return (
    <div className="grid grid-cols-4 gap-px border-b border-border bg-border">
      {items.map((i) => (
        <button
          key={i.key}
          onClick={() => setFilter(i.key)}
          aria-pressed={filter === i.key}
          className={cn(
            "flex flex-col items-start bg-surface px-3 py-2 text-left transition-colors hover:bg-accent/50",
            filter === i.key && "bg-accent shadow-[inset_0_-2px_0_var(--color-primary)]",
          )}
        >
          <span className={cn("font-mono text-lg font-semibold leading-none tabular-nums @md:text-xl", i.color)}>{counts[i.key]}</span>
          <span className="mt-1 text-[10.5px] uppercase tracking-wide text-muted-foreground">{i.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------- List ----------------
function StatusBadge({ status, pending }: { status: Pm2Status; pending?: Pm2Action | undefined }) {
  if (pending)
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10.5px] text-info ring-1 ring-info/30">
        <Loader2 className="size-3 animate-spin" />
        {pending}ing
      </span>
    );
  const s = {
    online: "text-success bg-success/10 ring-success/25",
    launching: "text-info bg-info/10 ring-info/25",
    stopping: "text-warning bg-warning/10 ring-warning/25",
    stopped: "text-muted-foreground bg-muted ring-border",
    errored: "text-destructive bg-destructive/10 ring-destructive/30",
  }[status];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10.5px] ring-1", s)}>
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function Meter({ value, max, label, danger }: { value: number; max: number; label: string; danger?: boolean }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-mono text-[11.5px] tabular-nums">{label}</span>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all duration-700", danger ? "bg-warning" : "bg-primary/70")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ProcessList({
  procs,
  now,
  selectedId,
  pending,
  compact,
  onSelect,
  onAction,
  onLogs,
  emptyReset,
}: {
  procs: Pm2Process[];
  now: number;
  selectedId: number | null;
  pending: Record<number, Pm2Action>;
  compact: boolean;
  onSelect: (p: Pm2Process) => void;
  onAction: (p: Pm2Process, a: Pm2Action) => void;
  onLogs: (p: Pm2Process) => void;
  emptyReset: () => void;
}) {
  if (procs.length === 0)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
        No processes match this filter.
        <button onClick={emptyReset} className="text-primary hover:underline">Clear filters</button>
      </div>
    );

  // Table columns appear progressively as the pane widens (container queries).
  const wideTable = !compact;
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {wideTable && (
        <div className="sticky top-0 z-10 hidden grid-cols-[2.5rem_minmax(8rem,1.6fr)_6.5rem_4.5rem_4rem_5.5rem_3.5rem_minmax(5rem,1fr)_minmax(5rem,1fr)_auto] gap-3 border-b border-border bg-surface px-3 py-1.5 text-[10.5px] uppercase tracking-wide text-muted-foreground @3xl:grid">
          <span>id</span><span>name</span><span>status</span><span>mode</span><span>pid</span><span>uptime</span><span>↺</span><span>cpu</span><span>mem</span><span className="w-[7.5rem] text-right">actions</span>
        </div>
      )}
      <ul>
        {procs.map((p) => {
          const pend = pending[p.pmId];
          const sel = p.pmId === selectedId;
          return (
            <li key={p.pmId} className={cn("group border-b border-border", sel && "bg-accent/60")}>
              {/* Wide table row */}
              {wideTable && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(p)}
                  onKeyDown={(e) => e.key === "Enter" && onSelect(p)}
                  className="hidden cursor-pointer grid-cols-[2.5rem_minmax(8rem,1.6fr)_6.5rem_4.5rem_4rem_5.5rem_3.5rem_minmax(5rem,1fr)_minmax(5rem,1fr)_auto] items-center gap-3 px-3 py-2 text-xs hover:bg-accent/40 @3xl:grid"
                >
                  <span className="font-mono text-muted-foreground">{p.pmId}</span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium">{p.name}</span>
                    {p.instances > 1 && <span className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">×{p.instances}</span>}
                  </span>
                  <StatusBadge status={p.status} pending={pend} />
                  <span className="font-mono text-muted-foreground">{p.mode}</span>
                  <span className="font-mono text-muted-foreground">{p.pid || "—"}</span>
                  <span className="font-mono tabular-nums">{fmt.uptime(p.startedAt, now)}</span>
                  <span className={cn("font-mono tabular-nums", p.restarts >= 10 && "text-warning")}>{p.restarts}</span>
                  <Meter value={p.cpu} max={100} label={`${p.cpu.toFixed(1)}%`} danger={p.cpu > 70} />
                  <Meter value={p.memory} max={512 * 1024 * 1024} label={fmt.mem(p.memory)} danger={p.memory > 450 * 1024 * 1024} />
                  <RowActions p={p} pending={pend} onAction={onAction} onLogs={onLogs} />
                </div>
              )}
              {/* Card row (narrow / medium / split) */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(p)}
                onKeyDown={(e) => e.key === "Enter" && onSelect(p)}
                className={cn("cursor-pointer px-3 py-2.5 hover:bg-accent/40", wideTable && "@3xl:hidden")}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">#{p.pmId}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{p.name}</span>
                  <StatusBadge status={p.status} pending={pend} />
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 @md:grid-cols-4">
                  <Meter value={p.cpu} max={100} label={`cpu ${p.cpu.toFixed(1)}%`} danger={p.cpu > 70} />
                  <Meter value={p.memory} max={512 * 1024 * 1024} label={`mem ${fmt.mem(p.memory)}`} danger={p.memory > 450 * 1024 * 1024} />
                  <Kv k="up" v={fmt.uptime(p.startedAt, now)} />
                  <Kv k="↺" v={String(p.restarts)} warn={p.restarts >= 10} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 font-mono text-[10.5px] text-muted-foreground">
                  <span>{p.mode}{p.instances > 1 ? ` ×${p.instances}` : ""}</span>
                  <span>pid {p.pid || "—"}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Kv({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <span className="font-mono text-[11.5px] tabular-nums">
      <span className="text-muted-foreground">{k} </span>
      <span className={cn(warn && "text-warning")}>{v}</span>
    </span>
  );
}

function RowActions({ p, pending, onAction, onLogs }: { p: Pm2Process; pending?: Pm2Action | undefined; onAction: (p: Pm2Process, a: Pm2Action) => void; onLogs: (p: Pm2Process) => void }) {
  return (
    <div className="flex w-[7.5rem] justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      {actionsFor(p).map((a) => {
        const M = ACTION_META[a];
        return (
          <button
            key={a}
            title={`${M.label} ${p.name}`}
            aria-label={`${M.label} ${p.name}`}
            disabled={!!pending}
            onClick={() => onAction(p, a)}
            className={cn(
              "grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30",
              M.destructive && "hover:bg-destructive/15 hover:text-destructive",
            )}
          >
            <M.icon className="size-3.5" />
          </button>
        );
      })}
      <button title="Open logs" onClick={() => onLogs(p)} className="rounded px-1 font-mono text-[10.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
        logs
      </button>
    </div>
  );
}

// ---------------- Detail ----------------
function ProcessDetail({
  adapter,
  p,
  now,
  tab,
  setTab,
  pending,
  onAction,
  onClose,
  logsExpanded,
  setLogsExpanded,
}: {
  adapter: Pm2Adapter;
  p: Pm2Process;
  now: number;
  tab: Tab;
  setTab: (t: Tab) => void;
  pending?: Pm2Action | undefined;
  onAction: (p: Pm2Process, a: Pm2Action) => void;
  onClose: () => void;
  logsExpanded: boolean;
  setLogsExpanded: (b: boolean) => void;
}) {
  const [showSecrets, setShowSecrets] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button onClick={onClose} aria-label="Back to process list" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
          <ArrowLeft className="size-4 @4xl:hidden" />
          <X className="hidden size-4 @4xl:block" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{p.name}</span>
            <StatusBadge status={p.status} pending={pending} />
          </div>
          <div className="font-mono text-[10.5px] text-muted-foreground">id {p.pmId} · pid {p.pid || "—"} · {p.mode}</div>
        </div>
      </div>
      {!logsExpanded && (
        <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
          {actionsFor(p).map((a) => {
            const M = ACTION_META[a];
            const busy = pending === a;
            return (
              <button
                key={a}
                disabled={!!pending}
                onClick={() => onAction(p, a)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs transition-colors hover:bg-accent disabled:opacity-50",
                  M.destructive && "text-destructive hover:border-destructive/40 hover:bg-destructive/10",
                  a === "start" && "border-primary/40 text-primary",
                )}
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <M.icon className="size-3.5" />}
                {busy ? `${M.label}ing…` : M.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex border-b border-border px-2" role="tablist">
        {(["overview", "logs", "env"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              if (t !== "logs") setLogsExpanded(false);
            }}
            className={cn(
              "border-b-2 px-2.5 py-1.5 text-xs capitalize transition-colors",
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "env" ? "Environment" : t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "overview" && (
          <div className="h-full overflow-auto p-3">
            {p.status === "errored" && (
              <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                PM2 stopped restarting this process after {p.restarts} unstable restarts.{" "}
                <button className="underline" onClick={() => setTab("logs")}>Check stderr</button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 @lg:grid-cols-3 @6xl:grid-cols-4">
              <Stat label="CPU" value={`${p.cpu.toFixed(1)}%`} />
              <Stat label="Memory" value={fmt.mem(p.memory)} />
              <Stat label="Uptime" value={fmt.uptime(p.startedAt, now)} />
              <Stat label="Restarts" value={String(p.restarts)} warn={p.restarts >= 10} />
              <Stat label="Instances" value={String(p.instances)} />
              <Stat label="Mode" value={p.mode} />
            </div>
            <dl className="mt-3 divide-y divide-border rounded-md border border-border text-xs">
              {[
                ["Name", p.name],
                ["PM2 ID", String(p.pmId)],
                ["PID", p.pid ? String(p.pid) : "—"],
                ["Status", p.status],
                ["Node", p.nodeVersion],
                ["Script", p.scriptPath],
                ["CWD", p.cwd],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3 px-2.5 py-1.5">
                  <dt className="w-16 shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 break-all font-mono text-[11.5px]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {tab === "env" && (
          <div className="h-full overflow-auto p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{Object.keys(p.env).length} variables</span>
              <button onClick={() => setShowSecrets(!showSecrets)} className="inline-flex items-center gap-1 hover:text-foreground">
                {showSecrets ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {showSecrets ? "Mask values" : "Reveal values"}
              </button>
            </div>
            <div className="divide-y divide-border rounded-md border border-border bg-background font-mono text-[11.5px]">
              {Object.entries(p.env).map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 px-2.5 py-1.5 @md:flex-row @md:gap-3">
                  <span className="shrink-0 text-info @md:w-44 @md:truncate">{k}</span>
                  <span className="min-w-0 break-all text-foreground/90">{showSecrets ? v : v.replace(/./g, "•").slice(0, 16)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "logs" && <LogViewer adapter={adapter} pmId={p.pmId} expanded={logsExpanded} onToggleExpand={() => setLogsExpanded(!logsExpanded)} />}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-2">
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-mono text-sm tabular-nums", warn && "text-warning")}>{value}</div>
    </div>
  );
}

// ---------------- Commands, dialogs, states ----------------
function CommandTray({ commands, onDismiss }: { commands: CommandEntry[]; onDismiss: (id: number) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    const done = commands.filter((c) => c.state === "success");
    if (!done.length) return;
    const t = setTimeout(() => done.forEach((c) => onDismiss(c.id)), 4000);
    return () => clearTimeout(t);
  }, [commands, onDismiss]);
  if (!commands.length) return null;
  return (
    <div className="max-h-[40%] overflow-auto border-t border-border bg-card">
      {commands.map((c) => (
        <div key={c.id} className="border-b border-border last:border-0">
          <div className="flex items-center gap-2 px-3 py-1.5 font-mono text-[11.5px]">
            {c.state === "running" && <Loader2 className="size-3.5 shrink-0 animate-spin text-info" />}
            {c.state === "success" && <CheckCircle2 className="size-3.5 shrink-0 text-success" />}
            {c.state === "error" && <XCircle className="size-3.5 shrink-0 text-destructive" />}
            <span className="min-w-0 flex-1 truncate">
              <span className="text-muted-foreground">$ </span>
              {c.command}
            </span>
            <span className={cn("shrink-0 text-[10.5px]", c.state === "error" ? "text-destructive" : "text-muted-foreground")}>
              {c.state === "running" ? "running…" : c.state === "success" ? "done" : `failed${c.error?.exitCode !== undefined ? ` (exit ${c.error.exitCode})` : ""}`}
            </span>
            {c.state === "error" && (
              <button onClick={() => setOpen(open === c.id ? null : c.id)} className="text-[10.5px] text-primary hover:underline">
                {open === c.id ? "hide" : "details"}
              </button>
            )}
            {c.state !== "running" && (
              <button aria-label="Dismiss" onClick={() => onDismiss(c.id)} className="text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {c.state === "error" && open === c.id && (
            <pre className="mx-3 mb-2 overflow-auto whitespace-pre-wrap rounded border border-destructive/25 bg-background p-2 font-mono text-[11px] text-destructive">
              {c.error?.message}
              {c.error?.stderr ? `\n\n${c.error.stderr}` : ""}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

function ConfirmDialog({ p, action, onCancel, onConfirm }: { p: Pm2Process; action: Pm2Action; onCancel: () => void; onConfirm: () => void }) {
  const M = ACTION_META[action];
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onCancel]);
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-background/70 p-4 backdrop-blur-[2px]" onClick={onCancel}>
      <div role="alertdialog" aria-modal className="w-full max-w-sm rounded-lg border border-border bg-popover p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold">
          {M.label} <span className="font-mono">{p.name}</span>?
        </h3>
        <p className="mt-1.5 text-xs text-muted-foreground">{M.confirm}</p>
        <code className="mt-3 block rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px] text-muted-foreground">$ pm2 {action} {p.name}</code>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="h-8 rounded-md border border-border px-3 text-xs hover:bg-accent">Cancel</button>
          <button
            autoFocus
            onClick={onConfirm}
            className={cn("h-8 rounded-md px-3 text-xs font-medium", M.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90")}
          >
            {M.label} process
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingState({ host }: { host: string }) {
  return (
    <div className="flex flex-1 flex-col" aria-busy>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 font-mono text-[11px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Running <span className="text-foreground">pm2 jlist</span> on {host}…
      </div>
      <div className="grid grid-cols-4 gap-px border-b border-border bg-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface px-3 py-2">
            <div className="h-5 w-6 animate-pulse rounded bg-muted" />
            <div className="mt-1.5 h-2 w-10 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="border-b border-border px-3 py-3">
          <div className="flex gap-2">
            <div className="h-3 w-6 animate-pulse rounded bg-muted" />
            <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${30 + ((i * 17) % 30)}%` }} />
          </div>
          <div className="mt-2.5 h-1.5 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function StateCard({
  icon: Icon,
  tone,
  title,
  text,
  error,
  children,
}: {
  icon: typeof Play;
  tone: "destructive" | "warning" | "muted";
  title: string;
  text: string;
  error?: Pm2Error | undefined;
  children?: React.ReactNode;
}) {
  const toneCls = { destructive: "text-destructive bg-destructive/10", warning: "text-warning bg-warning/10", muted: "text-muted-foreground bg-muted" }[tone];
  return (
    <div className="flex flex-1 items-center justify-center overflow-auto p-5">
      <div className="w-full max-w-md">
        <div className={cn("grid size-9 place-items-center rounded-lg", toneCls)}>
          <Icon className="size-4.5" />
        </div>
        <h2 className="mt-3 text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
        {error && (
          <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-2.5 font-mono text-[11px] text-muted-foreground">
            <span className="text-foreground">$ {error.command}</span>
            {"\n"}
            {error.stderr ?? error.message}
            {error.exitCode !== undefined && <span className="text-destructive">{`\nexit ${error.exitCode}`}</span>}
          </pre>
        )}
        {children && <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}

function Btn({ children, onClick, busy, icon: Icon, primary }: { children: React.ReactNode; onClick: () => void; busy?: boolean | undefined; icon: typeof Play; primary?: boolean | undefined }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors disabled:opacity-60",
        primary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border hover:bg-accent",
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
      {children}
    </button>
  );
}
