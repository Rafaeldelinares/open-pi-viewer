import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      "@core": path.join(srcDir, "core"),
      "@shared": path.join(srcDir, "shared"),
      "@infra": path.join(srcDir, "infra"),
      "@features": path.join(srcDir, "features"),
      "@app": path.join(srcDir, "app"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
