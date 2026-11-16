import type { GeminiKeyTier } from "@shortlist/schemas";

// Google may use free-tier inputs to improve its products, so a free-tier
// key only ever sees synthetic data (§14.4, §15.4). Throws for a run in a
// workspace that isn't marked synthetic.
export function assertKeyTierAllows(
  tier: GeminiKeyTier,
  workspace: { id: string; synthetic: boolean },
): void {
  if (tier === "free" && !workspace.synthetic) {
    throw new Error(
      `Run refused: this worker's Gemini key is free tier (GEMINI_KEY_TIER=free), which runs synthetic workspaces only, and workspace ${workspace.id} isn't synthetic`,
    );
  }
}
