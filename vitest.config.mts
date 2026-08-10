import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": root.replace(/[\\/]$/, "") },
  },
  test: {
    globals: true,
    // Default to node: both security tests exercise route handlers and the query
    // layer, not the DOM. Component tests opt in with an `@vitest-environment jsdom`
    // docblock at the top of the file.
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // The test database is one SQLite file. Running files in parallel would have
    // them truncating each other's fixtures between assertions.
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:./test.db",
      AUTH_SECRET: "test-secret-not-used-in-production",
      EMAIL_FROM: "no-reply@localops.test",
      EMAIL_SERVER_HOST: "localhost",
      EMAIL_SERVER_PORT: "1025",
    },
  },
});
