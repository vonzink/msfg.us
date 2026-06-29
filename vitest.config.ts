import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // `server-only` ships a stub that throws when resolved outside a React
    // Server Component bundler (Vitest resolves its client/react-server export
    // condition). Our server modules legitimately `import "server-only"` as a
    // build-time guard; alias it to a harmless no-op so unit tests can import
    // those modules and exercise their pure logic.
    alias: { "server-only": new URL("./test/stubs/server-only.ts", import.meta.url).pathname },
  },
});
