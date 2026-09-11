import { defineConfig } from "vitest/config";
import path from "node:path";

const pkg = (name: string) => path.resolve(__dirname, `packages/${name}/src/index.ts`);

export default defineConfig({
  resolve: {
    alias: {
      "@worldforge/core": pkg("core"),
      "@worldforge/world-gen": pkg("world-gen"),
      "@worldforge/prefabs": pkg("prefabs"),
      "@worldforge/quality": pkg("quality"),
      "@worldforge/roblox-export": pkg("roblox-export"),
      "@worldforge/roblox-cloud": pkg("roblox-cloud"),
      "@worldforge/agents": pkg("agents"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
