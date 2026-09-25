import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Check, Copy, Eraser, Maximize2, Minimize2, Pause, Play, Search } from "lucide-react";
import type { LogLine, LogStream, Pm2Adapter } from "@/lib/pm2/types";
import { fmt } from "@/lib/pm2/use-pm2";
import { cn } from "@/lib/utils";

const MAX_LINES = 2000;

export function LogViewer({
  adapter,
  pmId,
  expanded,
  onToggleExpand,
}: {
  adapter: Pm2Adapter;
  pmId: number;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [streams, setStreams] = useState<Record<LogStream, boolean>>({ stdout: true, stderr: true });
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const [live, setLive] = useState(true);
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const liveRef = useRef(live);
  liveRef.current = live;
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines([]);
    setConnecting(true);
    return adapter.subscribeLogs(pmId, (incoming) => {
      setConnecting(false);
      if (!liveRef.current) return;
      setLines((ls) => [...ls, ...incoming].slice(-MAX_LINES));
    });
  }, [adapter, pmId]);

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    return lines.filter((l) => streams[l.stream] && (!q || l.text.toLowerCase().includes(q)));
  }, [lines, streams, query]);

  useEffect(() => {
    if (follow && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [visible, follow]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (!atBottom && follow) setFollow(false);
  };

  const copy = async () => {
    const text = visible.map((l) => `${fmt.time(l.ts)} [${l.stream}] ${l.text}`).join("\n");
    await navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const highlight = (text: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
    return parts.map((p, i) =>
      p.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="rounded-sm bg-warning/30 text-foreground">
          {p}
        </mark>
      ) : (
        p
      ),
    );
  };

  const errCount = lines.filter((l) => l.stream === "stderr").length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
        <div className="flex rounded-md border border-border p-0.5 font-mono text-[11px]">
          {(["stdout", "stderr"] as LogStream[]).map((s) => (
            <button
              key={s}
              onClick={() => setStreams((x) => ({ ...x, [s]: !x[s] }))}
              className={cn(
                "rounded px-2 py-0.5 transition-colors",
                streams[s] ? (s === "stderr" ? "bg-destructive/20 text-destructive" : "bg-accent text-foreground") : "text-muted-foreground",
              )}
              aria-pressed={streams[s]}
            >
              {s}
              {s === "stderr" && errCount > 0 && <span className="ml-1 opacity-70">{errCount}</span>}
            </button>
          ))}
        </div>
        <div className="relative min-w-[120px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search logs"
            className="h-7 w-full rounded-md border border-input bg-background pl-6 pr-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-0.5">
          <ToolBtn label={live ? "Pause live output" : "Resume live output"} onClick={() => setLive(!live)} active={live}>
            {live ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </ToolBtn>
          <ToolBtn label="Follow / auto-scroll" onClick={() => setFollow(!follow)} active={follow}>
            <ArrowDownToLine className="size-3.5" />
          </ToolBtn>
          <ToolBtn label="Copy visible logs" onClick={copy}>
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          </ToolBtn>
          <ToolBtn label="Clear displayed logs" onClick={() => setLines([])}>
            <Eraser className="size-3.5" />
          </ToolBtn>
          <ToolBtn label={expanded ? "Collapse log view" : "Expand log view"} onClick={onToggleExpand}>
            {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </ToolBtn>
        </div>
      </div>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-auto bg-background px-2 py-1.5 font-mono text-[11.5px] leading-[1.55]"
      >
        {connecting ? (
          <p className="text-muted-foreground">$ pm2 logs {pmId} --raw --lines 60 …</p>
        ) : visible.length === 0 ? (
          <p className="text-muted-foreground">{lines.length ? "No lines match the current filter." : "Log buffer cleared. Waiting for new output…"}</p>
        ) : (
          visible.map((l) => (
            <div key={l.id} className={cn("flex gap-2 whitespace-pre-wrap break-all hover:bg-accent/40", l.stream === "stderr" && "text-destructive")}>
              <span className="shrink-0 select-none text-muted-foreground/70">{fmt.time(l.ts)}</span>
              <span className="min-w-0">{highlight(l.text)}</span>
            </div>
          ))
        )}
      </div>
      <div className="flex items-center justify-between border-t border-border px-2 py-1 font-mono text-[10.5px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", live ? "animate-pulse bg-success" : "bg-muted-foreground")} />
          {live ? "live" : "paused"} · {visible.length}/{lines.length} lines
        </span>
        {!follow && (
          <button className="text-primary hover:underline" onClick={() => setFollow(true)}>
            jump to latest ↓
          </button>
        )}
      </div>
    </div>
  );
}

function ToolBtn({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "text-primary",
      )}
    >
      {children}
    </button>
  );
}
