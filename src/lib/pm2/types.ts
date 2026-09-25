// PM2 domain types. Shapes mirror `pm2 jlist` closely so a real SSH adapter can map 1:1.

export type Pm2Status = "online" | "stopped" | "stopping" | "launching" | "errored";
export type Pm2Mode = "fork" | "cluster";
export type Pm2Action = "start" | "restart" | "reload" | "stop" | "delete";

export interface Pm2Process {
  pmId: number;
  name: string;
  status: Pm2Status;
  mode: Pm2Mode;
  pid: number;
  instances: number;
  /** epoch ms when the process came online (pm_uptime) */
  startedAt: number | null;
  restarts: number;
  cpu: number; // percent
  memory: number; // bytes
  nodeVersion: string;
  scriptPath: string;
  cwd: string;
  env: Record<string, string>;
}

export interface Pm2Snapshot {
  version: string;
  processes: Pm2Process[];
  fetchedAt: number;
}

export type LogStream = "stdout" | "stderr";
export interface LogLine {
  id: number;
  ts: number;
  stream: LogStream;
  text: string;
}

export type Pm2ErrorCode = "SSH_UNAVAILABLE" | "NOT_INSTALLED" | "COMMAND_FAILED";

export class Pm2Error extends Error {
  constructor(
    public code: Pm2ErrorCode,
    message: string,
    public command?: string,
    public stderr?: string,
    public exitCode?: number,
  ) {
    super(message);
  }
}

/**
 * The contract the plugin UI depends on. Replace the mock with an implementation
 * that runs `pm2 jlist`, `pm2 <action> <id>`, `pm2 logs <id> --raw` over Zync's SSH channel.
 */
export interface Pm2Adapter {
  host: string;
  getSnapshot(): Promise<Pm2Snapshot>;
  runAction(pmId: number, action: Pm2Action): Promise<{ command: string; stdout: string }>;
  subscribeLogs(pmId: number, onLines: (lines: LogLine[]) => void): () => void;
  installPm2(): Promise<{ command: string; stdout: string }>;
}
