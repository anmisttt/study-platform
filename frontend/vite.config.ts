import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
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
  server: {
    fs: {
      allow: [frontendRoot, sharedRoot],
    },
    host: true,
    allowedHosts: [".ngrok-free.dev"],
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
