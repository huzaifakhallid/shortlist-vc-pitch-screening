import {
  getActiveConfig,
  getWorkspaceBySlug,
  type Workspace,
} from "@shortlist/db";

export type PitchFormStatus =
  | { status: "not_found" }
  | { status: "closed"; workspace: Workspace }
  | { status: "open"; workspace: Workspace };

// The public pitch form of the workspace with this slug. The form takes
// pitches only when Intake is on with the form channel (§7.1), and never in
// a synthetic workspace: the demo's form is off (§21), and a free-tier
// Gemini key runs synthetic workspaces, so real pitches must not land there
// (§14.4, §15.4).
export async function pitchFormStatus(slug: string): Promise<PitchFormStatus> {
  const workspace = await getWorkspaceBySlug(slug);
  if (workspace === null) {
    return { status: "not_found" };
  }
  if (workspace.synthetic) {
    return { status: "closed", workspace };
  }
  const { intake } = (await getActiveConfig(workspace.id)).config.agents;
  if (!intake.enabled || !intake.channels.includes("form")) {
    return { status: "closed", workspace };
  }
  return { status: "open", workspace };
}
