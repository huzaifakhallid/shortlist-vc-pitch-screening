import { defineProject } from "vitest/config";

// Components are rendered to static HTML with react-dom/server, so no DOM
// environment is needed. tsconfigPaths resolves the "@/" alias.
export default defineProject({
  resolve: { tsconfigPaths: true },
  test: {
    name: "web",
  },
});
