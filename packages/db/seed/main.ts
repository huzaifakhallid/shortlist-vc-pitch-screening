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
  const { status, workspace, config, dealsAdded } = await seedDemoWorkspace();
  console.log(
    status === "created"
      ? `Seeded workspace "${workspace.slug}" with config v${String(config.version)}`
      : `Workspace "${workspace.slug}" already exists (active config v${String(config.version)}); members and config left unchanged`,
  );
  console.log(
    dealsAdded > 0
      ? `Added ${String(dealsAdded)} synthetic demo deals`
      : "The workspace already has deals; no demo deals added",
  );
} finally {
  await closeDb();
}
