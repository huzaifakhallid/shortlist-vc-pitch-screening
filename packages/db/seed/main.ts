import { existsSync } from "node:fs";
import { closeDb } from "../index";
import { seedDemoWorkspace } from "./seed";

// `pnpm db:seed`. Local development reads the repo-root .env; CI and the demo
// deploy set the variables directly. The client validates them (dbEnvSchema).
const envFile = new URL("../../../.env", import.meta.url);
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

try {
  const { status, workspace, config } = await seedDemoWorkspace();
  console.log(
    status === "created"
      ? `Seeded workspace "${workspace.slug}" with config v${String(config.version)}`
      : `Workspace "${workspace.slug}" already exists (active config v${String(config.version)}); left unchanged`,
  );
} finally {
  await closeDb();
}
