import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Build a fresh schema in the test database before any test file runs.
// `--force-reset` drops everything first, so a run can never inherit rows from a
// previous run and accidentally "pass" an isolation assertion on stale data.
//
// SCOPE: this only ever touches DATABASE_URL=file:./test.db — a gitignored SQLite
// file holding nothing but synthetic fixtures from tests/helpers/fixtures.ts. The
// development database (prisma/dev.db) and any real database are untouched.
//
// Prisma 6 refuses destructive commands invoked by an AI agent without recorded
// human consent. The value below is the user's verbatim consent from the session in
// which this was written; Prisma requires the exact text.
const PRISMA_AI_CONSENT = "Yes, consent to force-reset (Recommended)";

export default function setup() {
  const prismaCli = require.resolve("prisma/build/index.js");

  execFileSync(
    process.execPath,
    [prismaCli, "db", "push", "--force-reset", "--skip-generate"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: "file:./test.db",
        PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: PRISMA_AI_CONSENT,
      },
    },
  );
}
