import { Pm2Error, type LogLine, type Pm2Action, type Pm2Adapter, type Pm2Process, type Pm2Snapshot } from "./types";

export type MockScenario = "normal" | "empty" | "not-installed" | "ssh-down" | "slow" | "action-failures";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const MB = 1024 * 1024;
const now = () => Date.now();

function seed(): Pm2Process[] {
  const base = { nodeVersion: "v20.11.1" };
  const env = (extra: Record<string, string>) => ({
    NODE_ENV: "production",
    PM2_HOME: "/home/deploy/.pm2",
    LOG_LEVEL: "info",
    ...extra,
  });
  return [
    { ...base, pmId: 0, name: "api-gateway", status: "online", mode: "cluster", pid: 21834, instances: 4, startedAt: now() - 3 * 86400e3 - 4 * 3600e3, restarts: 2, cpu: 23, memory: 212 * MB, scriptPath: "/srv/api/dist/server.js", cwd: "/srv/api", env: env({ PORT: "8080", DATABASE_URL: "postgres://api:••••@10.0.1.12:5432/core", REDIS_URL: "redis://10.0.1.14:6379" }) },
    { ...base, pmId: 1, name: "auth-service", status: "online", mode: "fork", pid: 21901, instances: 1, startedAt: now() - 3 * 86400e3, restarts: 0, cpu: 4, memory: 96 * MB, scriptPath: "/srv/auth/index.js", cwd: "/srv/auth", env: env({ PORT: "8081", JWT_ISSUER: "zync-auth", SESSION_TTL: "3600" }) },
    { ...base, pmId: 2, name: "web-frontend", status: "online", mode: "cluster", pid: 22010, instances: 2, startedAt: now() - 18 * 3600e3, restarts: 5, cpu: 11, memory: 318 * MB, scriptPath: "/srv/web/node_modules/.bin/next", cwd: "/srv/web", env: env({ PORT: "3000", NEXT_TELEMETRY_DISABLED: "1" }) },
    { ...base, pmId: 3, name: "worker-queue", status: "errored", mode: "fork", pid: 0, instances: 1, startedAt: null, restarts: 15, cpu: 0, memory: 0, scriptPath: "/srv/workers/queue.js", cwd: "/srv/workers", env: env({ QUEUE_CONCURRENCY: "8", REDIS_URL: "redis://10.0.1.14:6379" }) },
    { ...base, pmId: 4, name: "cron-scheduler", status: "stopped", mode: "fork", pid: 0, instances: 1, startedAt: null, restarts: 1, cpu: 0, memory: 0, scriptPath: "/srv/workers/cron.js", cwd: "/srv/workers", env: env({ TZ: "UTC" }) },
    { ...base, pmId: 5, name: "socket-server", status: "online", mode: "fork", pid: 22187, instances: 1, startedAt: now() - 47 * 60e3, restarts: 9, cpu: 7, memory: 141 * MB, scriptPath: "/srv/realtime/socket.js", cwd: "/srv/realtime", env: env({ PORT: "8090", WS_PING_INTERVAL: "25000" }) },
    { ...base, pmId: 6, name: "image-processor", status: "online", mode: "fork", pid: 22240, instances: 1, startedAt: now() - 6 * 3600e3, restarts: 0, cpu: 38, memory: 486 * MB, nodeVersion: "v18.19.0", scriptPath: "/srv/media/processor.js", cwd: "/srv/media", env: env({ SHARP_CONCURRENCY: "2", S3_BUCKET: "zync-media-prod" }) },
  ];
}

const LOG_TEMPLATES: Record<string, { out: string[]; err: string[] }> = {
  default: {
    out: ["GET /health 200 2ms", "GET /api/v1/users/me 200 14ms", "POST /api/v1/sessions 201 41ms", "GET /api/v1/projects?page=2 200 23ms", "cache hit key=user:4821", "PUT /api/v1/settings 204 9ms", "db pool: 8/20 active", "GET /api/v1/metrics 200 5ms"],
    err: ["WARN slow query (412ms): SELECT * FROM events WHERE ...", "Error: ECONNRESET upstream 10.0.1.19:443", "WARN rate limit approaching for client=ci-runner", "UnhandledPromiseRejection: TimeoutError: Operation timed out after 5000ms\n    at Timeout._onTimeout (/srv/app/lib/http.js:88:15)"],
  },
  "worker-queue": {
    out: ["worker booting, concurrency=8", "connecting to redis://10.0.1.14:6379"],
    err: ["Error: connect ECONNREFUSED 10.0.1.14:6379\n    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1555:16)", "[PM2] App [worker-queue:3] exited with code [1] via signal [SIGINT]", "[PM2] Script /srv/workers/queue.js had too many unstable restarts (15). Stopped. \"errored\""],
  },
  "image-processor": {
    out: ["processed img_8f21.jpg 1920x1080 -> webp 184kb (212ms)", "processed avatar_331.png 512x512 -> webp 22kb (41ms)", "queue depth: 14", "processed banner_07.jpg 2400x800 -> webp 301kb (388ms)"],
    err: ["WARN memory usage above 450MB, consider scaling", "Error: Input buffer contains unsupported image format"],
  },
};

let logSeq = 1;
function makeLine(name: string, forceStream?: "stdout" | "stderr"): LogLine {
  const t = LOG_TEMPLATES[name] ?? LOG_TEMPLATES.default;
  const stream = forceStream ?? (Math.random() < 0.15 ? "stderr" : "stdout");
  const list = stream === "stdout" ? t.out : t.err;
  return { id: logSeq++, ts: now(), stream, text: list[Math.floor(Math.random() * list.length)] };
}

export function createMockAdapter(scenario: MockScenario): Pm2Adapter {
  let procs: Pm2Process[] = scenario === "empty" ? [] : seed();
  const latency = scenario === "slow" ? 2600 : 450;
  const logListeners = new Map<number, Set<(l: LogLine[]) => void>>();
  const emit = (pmId: number, lines: LogLine[]) => logListeners.get(pmId)?.forEach((cb) => cb(lines));

  const guard = () => {
    if (scenario === "ssh-down") throw new Pm2Error("SSH_UNAVAILABLE", "ssh: connect to host 203.0.113.42 port 22: Connection timed out", "ssh deploy@prod-web-01", undefined, 255);
    if (scenario === "not-installed") throw new Pm2Error("NOT_INSTALLED", "pm2: command not found", "pm2 jlist", "bash: line 1: pm2: command not found", 127);
  };

  const jitter = () => {
    for (const p of procs) {
      if (p.status !== "online") continue;
      const target = p.name === "image-processor" ? 40 : p.name === "api-gateway" ? 22 : 8;
      p.cpu = Math.max(0, Math.min(100, p.cpu + rand(-6, 6) + (target - p.cpu) * 0.2));
      p.memory = Math.max(40 * MB, p.memory + rand(-4, 5) * MB);
      if (p.name === "socket-server" && Math.random() < 0.04) {
        p.restarts++;
        p.startedAt = now();
        p.pid += 3;
        emit(p.pmId, [makeLine(p.name, "stderr"), { id: logSeq++, ts: now(), stream: "stdout", text: "[PM2] restarting socket-server after crash" }]);
      }
    }
  };

  return {
    host: "deploy@prod-web-01",
    async getSnapshot(): Promise<Pm2Snapshot> {
      await sleep(latency * rand(0.6, 1.1));
      guard();
      jitter();
      return { version: "5.3.1", processes: procs.map((p) => ({ ...p, env: { ...p.env } })), fetchedAt: now() };
    },

    async runAction(pmId: number, action: Pm2Action) {
      const p = procs.find((x) => x.pmId === pmId);
      const command = `pm2 ${action} ${p?.name ?? pmId}`;
      await sleep(rand(700, 1500));
      guard();
      if (!p) throw new Pm2Error("COMMAND_FAILED", `Process ${pmId} not found`, command, `[PM2][ERROR] Process or Namespace ${pmId} not found`, 1);
      if (scenario === "action-failures" || (p.name === "worker-queue" && (action === "start" || action === "restart") && Math.random() < 0.5)) {
        throw new Pm2Error("COMMAND_FAILED", `pm2 ${action} exited with code 1`, command, `[PM2][ERROR] Process ${p.name} failed to start\nError: connect ECONNREFUSED 10.0.1.14:6379\n    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1555:16)`, 1);
      }
      if (action === "reload" && p.status !== "online") {
        throw new Pm2Error("COMMAND_FAILED", "Cannot reload a process that is not online", command, `[PM2][ERROR] Process ${p.name} is not online (status: ${p.status})`, 1);
      }
      switch (action) {
        case "start":
        case "restart":
        case "reload":
          if (action !== "start" || p.status !== "online") p.restarts += action === "start" ? 0 : 1;
          p.status = "online";
          p.pid = 20000 + Math.floor(Math.random() * 9000);
          p.startedAt = now();
          p.cpu = rand(8, 20);
          p.memory = rand(80, 200) * MB;
          emit(pmId, [{ id: logSeq++, ts: now(), stream: "stdout", text: `[PM2] ${action === "reload" ? "Reloading (0s downtime)" : "Starting"} ${p.name}… online` }]);
          break;
        case "stop":
          p.status = "stopped";
          p.pid = 0;
          p.cpu = 0;
          p.memory = 0;
          p.startedAt = null;
          emit(pmId, [{ id: logSeq++, ts: now(), stream: "stdout", text: `[PM2] Stopping ${p.name}… stopped` }]);
          break;
        case "delete":
          procs = procs.filter((x) => x.pmId !== pmId);
          break;
      }
      return { command, stdout: `[PM2] Applying action ${action}Process on app [${p.name}](ids: [ ${pmId} ])\n[PM2] [${p.name}](${pmId}) ✓` };
    },

    subscribeLogs(pmId, onLines) {
      const set = logListeners.get(pmId) ?? new Set();
      set.add(onLines);
      logListeners.set(pmId, set);
      const p = procs.find((x) => x.pmId === pmId);
      const name = p?.name ?? "unknown";
      // backlog, like `pm2 logs --lines 60`
      const back: LogLine[] = [];
      for (let i = 60; i > 0; i--) back.push({ ...makeLine(name), ts: now() - i * 4200 });
      setTimeout(() => onLines(back), 250);
      const timer = setInterval(() => {
        const cur = procs.find((x) => x.pmId === pmId);
        if (cur?.status !== "online") return;
        const n = Math.random() < 0.3 ? 2 : 1;
        onLines(Array.from({ length: n }, () => makeLine(name)));
      }, 900);
      return () => {
        clearInterval(timer);
        set.delete(onLines);
      };
    },

    async installPm2() {
      await sleep(2200);
      throw new Pm2Error("COMMAND_FAILED", "Install requires elevated permissions", "npm install -g pm2", "npm ERR! code EACCES\nnpm ERR! syscall mkdir\nnpm ERR! path /usr/lib/node_modules/pm2\nnpm ERR! Error: EACCES: permission denied", 243);
    },
  };
}
