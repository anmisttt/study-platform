// Isolated browser-test server. Never reads production credentials or databases.
import { createServer } from "node:http";
import { createApplication } from "../src/app.js";
import { RoomsDb } from "../src/db/roomsDb.js";
import type { AuthEmail } from "../src/auth.js";

if (process.env.NODE_ENV !== "test") throw new Error("The browser-test server requires NODE_ENV=test.");
const db = new RoomsDb(":memory:"); db.initializeSchema();
const emails: AuthEmail[] = [];
const { app, realtime } = createApplication({
  roomsDb: db,
  config: {
    publicOrigin: "http://127.0.0.1:5183", trustedOrigins: ["http://127.0.0.1:5183"], production: false,
    authSecret: "isolated-browser-tests-secret-not-for-production", encryptionSecret: "b".repeat(64),
    google: { clientId: "test-google", clientSecret: "test-google-secret" },
    github: { clientId: "test-github", clientSecret: "test-github-secret" },
  },
  sendEmail: async email => { emails.push(email); },
  llm: {
    grade: async () => ({ rating: 4, comment: "Your answer covers the main idea. Add an example for more detail." }),
    transcribe: async () => ({ value: "test-ephemeral-credential", expires_at: 123 }),
  },
});
app.get("/__test/emails", (req, res) => { res.json(emails.filter(email => email.to === req.query.email)); });
const server = createServer(app);
realtime.attach(server, "/ws/rooms");
server.listen(3081, "127.0.0.1", () => console.log("Isolated browser-test API listening on 3081"));
