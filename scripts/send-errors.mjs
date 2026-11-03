#!/usr/bin/env node
// Sends new backend errors to the private triage workflow once a day.
// Usage: node send-errors.mjs [--dry-run]
//   --dry-run  print the payload; send nothing and keep the saved offsets
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const appDir = process.env.APP_DIR || import.meta.dirname;
const conf = { ...readEnv(path.join(appDir, "triage.env")), ...process.env };
const proc = conf.BACKEND_PROCESS_NAME || "study-backend";
const statePath = path.join(appDir, "logs", "send-errors.state.json");
const maxChars = 60000;
const maxRead = 50 * 1024 * 1024;

const sources = [
  { name: "backend", file: conf.BACKEND_ERROR_LOG || path.join(os.homedir(), ".pm2", "logs", `${proc}-error.log`), parse: parseNode },
  { name: "nginx", file: conf.NGINX_ERROR_LOG || "/var/log/nginx/error.log", parse: parseNginx },
];

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const key = line.slice(0, line.indexOf("=")).trim();
    out[key] = line.slice(line.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

function loadState() {
  if (!fs.existsSync(statePath)) return {};
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function readRange(file, start, end) {
  start = Math.max(start, end - maxRead);
  if (end <= start) return "";
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(end - start);
  fs.readSync(fd, buf, 0, buf.length, start);
  fs.closeSync(fd);
  return buf.toString("utf8");
}

// Rotation renames the file (inode kept) or truncates it, so match by inode
// and fall back to reading the new file from the start.
function readNew(src, prev) {
  if (!fs.existsSync(src.file)) {
    console.log(`${src.name}: ${src.file} not found, skipping`);
    return { text: "", pos: prev };
  }
  try {
    fs.accessSync(src.file, fs.constants.R_OK);
  } catch (err) {
    console.error(`${src.name}: cannot read ${src.file}, skipping:`, err.message);
    return { text: "", pos: prev };
  }
  const st = fs.statSync(src.file);
  const pos = { ino: st.ino, offset: st.size };
  if (!prev) {
    console.log(`${src.name}: first run, starting at end of ${src.file}`);
    return { text: "", pos };
  }
  if (prev.ino === st.ino) {
    const start = st.size < prev.offset ? 0 : prev.offset;
    return { text: readRange(src.file, start, st.size), pos };
  }
  let text = "";
  const dir = path.dirname(src.file);
  const old = fs.readdirSync(dir)
    .map((f) => path.join(dir, f))
    .find((f) => f !== src.file && !f.endsWith(".gz") && fs.statSync(f).ino === prev.ino);
  if (old) text = readRange(old, prev.offset, fs.statSync(old).size);
  else console.log(`${src.name}: rotated file not found, unread tail of it is lost`);
  return { text: text + readRange(src.file, 0, st.size), pos };
}

// PM2 --time prefixes each line with "YYYY-MM-DDTHH:mm:ss: ".
const pm2Time = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}): /;

function parseNode(text) {
  const events = [];
  let cur = null;
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    const m = raw.match(pm2Time);
    const line = m ? raw.slice(m[0].length) : raw;
    const cont = /^\s/.test(line) || /^[}\]]/.test(line);
    if (cont && cur) {
      cur.lines.push(line);
      continue;
    }
    cur = { time: m?.[1] ?? null, lines: [line] };
    events.push(cur);
  }
  return events.map((e) => {
    const frames = e.lines.filter((l) => /^\s+at /.test(l)).map((l) => l.trim());
    return { time: e.time, msg: e.lines[0], frames, detail: e.lines.slice(1, 8) };
  });
}

function parseNginx(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \[(error|crit|alert|emerg)\] \d+#\d+: (?:\*\d+ )?(.*)$/);
    if (!m) continue;
    if (m[2] === "error" && !/upstream/.test(m[3])) continue;
    const msg = m[3].replace(/, client: .*$/, "");
    out.push({ time: m[1].replace(/\//g, "-").replace(" ", "T"), msg: `[${m[2]}] ${msg}`, frames: [], detail: [] });
  }
  return out;
}

const redactions = [
  [/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g, "<email>"],
  [/\b(cookie|set-cookie)\b(["']?\s*[:=]\s*)[^\n}]+/gi, "$1$2<redacted>"],
  [/\b(authorization|x-api-key|api-key)\b(["']?\s*[:=]\s*["']?)(?:(?:bearer|basic|token)\s+)?[^\s,"'}]+/gi, "$1$2<redacted>"],
  [/\b(bearer|basic)\s+[\w.~+/=-]+/gi, "$1 <redacted>"],
  [/\b(token|secret|password|passwd|pwd|key|session|sig)\b(["']?\s*[:=]\s*["']?)[^\s&"',}]+/gi, "$1$2<redacted>"],
  [/([?&](?:code|state)=)[^&\s"']+/gi, "$1<redacted>"],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>"],
  [/\b(sk|pk|rk)-[\w-]{10,}/g, "<key>"],
  [/\b(gh[pousr]_|github_pat_)\w+/g, "<gh-token>"],
  [/\b(?=[\w+-]*\d)(?=[\w+-]*[A-Za-z])[\w+-]{32,}={0,2}/g, "<secret>"],
  [/\b(\d{1,3}\.){3}\d{1,3}\b/g, "<ip>"],
  [/\b([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b/gi, "<ip>"],
  [/\b[0-9a-f]{0,4}(:[0-9a-f]{1,4})*::[0-9a-f]{1,4}(:[0-9a-f]{1,4})*\b/gi, "<ip>"],
];

function redact(s) {
  return redactions.reduce((acc, [re, rep]) => acc.replace(re, rep), s);
}

function signature(source, e) {
  const norm = (s) => s
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b[0-9a-f]{8,}\b/gi, "<hex>")
    .replace(/\d+/g, "N");
  return `${source}|${norm(redact(e.msg))}|${norm(e.frames[0] ?? "")}`;
}

function group(events) {
  const groups = new Map();
  for (const { source, e } of events) {
    const sig = signature(source, e);
    let g = groups.get(sig);
    if (!g) {
      g = {
        source,
        message: redact(e.msg).slice(0, 500),
        frames: e.frames.slice(0, 6).map((f) => redact(f).slice(0, 300)),
        detail: e.frames.length ? [] : e.detail.map((d) => redact(d).slice(0, 300)),
        count: 0,
        first: e.time,
        last: e.time,
      };
      groups.set(sig, g);
    }
    g.count += 1;
    if (e.time) {
      g.first ??= e.time;
      g.last = e.time;
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

function fit(groups) {
  const kept = [];
  let size = 200;
  for (const g of groups) {
    size += JSON.stringify(g).length + 1;
    if (size > maxChars) break;
    kept.push(g);
  }
  return JSON.stringify({ host: os.hostname(), groups: kept, omitted: groups.length - kept.length });
}

async function dispatch(errors) {
  const missing = ["GITHUB_TOKEN", "TRIAGE_REPO", "TRIAGE_WORKFLOW"].filter((k) => !conf[k]);
  if (missing.length) throw new Error(`Missing ${missing.join(", ")} in ${path.join(appDir, "triage.env")}`);
  const url = `https://api.github.com/repos/${conf.TRIAGE_REPO}/actions/workflows/${conf.TRIAGE_WORKFLOW}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${conf.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: conf.TRIAGE_REF || "main", inputs: { errors } }),
  });
  if (!res.ok) throw new Error(`Dispatch failed: ${res.status} ${await res.text()}`);
}

async function main() {
  const state = loadState();
  const next = {};
  const events = [];
  for (const src of sources) {
    const { text, pos } = readNew(src, state[src.name]);
    if (pos) next[src.name] = pos;
    for (const e of src.parse(text)) events.push({ source: src.name, e });
  }
  const groups = group(events);
  const payload = groups.length ? fit(groups) : null;
  if (args.has("--dry-run")) {
    console.log(payload ?? "No new errors");
    return;
  }
  if (payload) {
    await dispatch(payload);
    console.log(`${new Date().toISOString()} sent ${groups.length} error groups (${events.length} events)`);
  } else {
    console.log(`${new Date().toISOString()} no new errors`);
  }
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(next));
}

main().catch((err) => {
  console.error(`${new Date().toISOString()} send-errors failed:`, err);
  process.exit(1);
});
