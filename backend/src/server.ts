import "dotenv/config";
import { createServer } from "node:http";
import { roomsWebSocketBasePath } from "@study-platform/shared";
import { createApplication } from "./app.js";
import { readConfig } from "./config.js";
import { RoomsDb } from "./db/roomsDb.js";
import { shutdownLangfuseTracing } from "./observability/langfuse.js";

const roomsDb = new RoomsDb();
roomsDb.initializeSchema();
const { app, realtime } = createApplication({ roomsDb, config: readConfig() });
const httpServer = createServer(app);
const wss = realtime.attach(httpServer, roomsWebSocketBasePath());
const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST ?? "127.0.0.1";
httpServer.listen(port, host, () => console.log(`Backend server running on http://${host}:${port}`));
function shutdown() {
  for (const client of wss.clients) client.close(1001, "Server restarting");
  httpServer.close(() => { void shutdownLangfuseTracing().finally(() => { roomsDb.close(); process.exit(0); }); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
