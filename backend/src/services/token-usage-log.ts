import fs from "fs";
import path from "path";

type UsagePayload = {
  endpoint: string;
  model: string;
  usage: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
  };
};

const defaultLogPath = path.join(__dirname, "..", "logs", "token-usage.jsonl");

function resolveLogPath(): string | null {
  const configured = process.env.TOKEN_USAGE_LOG?.trim();
  if (configured === "off" || configured === "false") {
    return null;
  }
  return configured || defaultLogPath;
}

export function logTokenUsage(payload: UsagePayload): void {
  const logPath = resolveLogPath();
  if (!logPath) {
    return;
  }

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...payload,
  });

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${line}\n`, "utf8");
}
