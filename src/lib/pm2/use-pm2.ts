import { useCallback, useEffect, useRef, useState } from "react";
import { Pm2Error, type Pm2Action, type Pm2Adapter, type Pm2Snapshot } from "./types";

export interface CommandEntry {
  id: number;
  command: string;
  state: "running" | "success" | "error";
  output?: string;
  error?: Pm2Error;
  at: number;
}

const POLL_MS = 3000;
let cmdSeq = 1;

export function usePm2(adapter: Pm2Adapter) {
  const [snapshot, setSnapshot] = useState<Pm2Snapshot | null>(null);
  const [error, setError] = useState<Pm2Error | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<Record<number, Pm2Action>>({});
  const [commands, setCommands] = useState<CommandEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const inflight = useRef(false);

  const refresh = useCallback(
    async (manual = false) => {
      if (inflight.current) return;
      inflight.current = true;
      if (manual) setRefreshing(true);
      try {
        const s = await adapter.getSnapshot();
        setSnapshot(s);
        setError(null);
      } catch (e) {
        setError(e instanceof Pm2Error ? e : new Pm2Error("COMMAND_FAILED", String(e)));
      } finally {
        inflight.current = false;
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [adapter],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (paused || error?.code === "NOT_INSTALLED") return;
    const t = setInterval(() => refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh, paused, error?.code]);

  const pushCmd = (c: CommandEntry) => setCommands((cs) => [c, ...cs].slice(0, 6));
  const patchCmd = (id: number, patch: Partial<CommandEntry>) =>
    setCommands((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const run = useCallback(
    async (pmId: number, action: Pm2Action, name: string) => {
      const id = cmdSeq++;
      pushCmd({ id, command: `pm2 ${action} ${name}`, state: "running", at: Date.now() });
      setPending((p) => ({ ...p, [pmId]: action }));
      try {
        const r = await adapter.runAction(pmId, action);
        patchCmd(id, { state: "success", output: r.stdout });
        await refresh();
        return true;
      } catch (e) {
        const err = e instanceof Pm2Error ? e : new Pm2Error("COMMAND_FAILED", String(e));
        patchCmd(id, { state: "error", error: err });
        return false;
      } finally {
        setPending((p) => {
          const n = { ...p };
          delete n[pmId];
          return n;
        });
      }
    },
    [adapter, refresh],
  );

  const install = useCallback(async () => {
    const id = cmdSeq++;
    pushCmd({ id, command: "npm install -g pm2", state: "running", at: Date.now() });
    try {
      const r = await adapter.installPm2();
      patchCmd(id, { state: "success", output: r.stdout });
      await refresh(true);
    } catch (e) {
      patchCmd(id, { state: "error", error: e instanceof Pm2Error ? e : new Pm2Error("COMMAND_FAILED", String(e)) });
    }
  }, [adapter, refresh]);

  const dismissCmd = (id: number) => setCommands((cs) => cs.filter((c) => c.id !== id));

  return { snapshot, error, initialLoading, refreshing, pending, commands, paused, setPaused, refresh, run, install, dismissCmd };
}

export const fmt = {
  mem(b: number) {
    if (!b) return "0 B";
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1)} MB`;
    return `${(b / 1024 ** 3).toFixed(2)} GB`;
  },
  uptime(startedAt: number | null, at = Date.now()) {
    if (!startedAt) return "—";
    const s = Math.max(0, Math.floor((at - startedAt) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  },
  time(ts: number) {
    return new Date(ts).toISOString().slice(11, 23);
  },
};
