import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const pkg = (name: string) => path.resolve(__dirname, `../../packages/${name}/src/index.ts`);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@worldforge/core": pkg("core"),
      "@worldforge/world-gen": pkg("world-gen"),
      "@worldforge/prefabs": pkg("prefabs"),
      "@worldforge/quality": pkg("quality"),
      "@worldforge/roblox-export": pkg("roblox-export"),
      "@worldforge/roblox-cloud": pkg("roblox-cloud"),
      "@worldforge/agents": pkg("agents"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: false,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2500,
  },
});
