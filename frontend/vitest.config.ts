import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const sharedRoot = path.resolve(frontendRoot, "../shared");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@study-platform/shared": path.join(sharedRoot, "index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
