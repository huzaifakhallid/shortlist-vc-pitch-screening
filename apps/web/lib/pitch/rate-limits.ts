import { consumeRateLimit } from "@shortlist/db";

// Public form limits per hour (§15.5): per visitor IP and per workspace, on
// deck presigns and pitch submissions. Uncalibrated starting values.
const WINDOW_SECONDS = 3600;
const LIMITS = {
  presign: { perIp: 20, perWorkspace: 300 },
  submit: { perIp: 5, perWorkspace: 100 },
} as const;

export type PitchAction = keyof typeof LIMITS;

// Counts the request in the IP bucket, then the workspace bucket; false when
// either is over its limit. A request refused per IP isn't counted for the
// workspace, so one visitor can't use up the fund's allowance alone.
export async function withinPitchRateLimits(
  workspaceId: string,
  action: PitchAction,
  ip: string,
): Promise<boolean> {
  const limits = LIMITS[action];
  const ipOk = await consumeRateLimit(workspaceId, `${action}:ip:${ip}`, {
    limit: limits.perIp,
    windowSeconds: WINDOW_SECONDS,
  });
  if (!ipOk) {
    return false;
  }
  return consumeRateLimit(workspaceId, action, {
    limit: limits.perWorkspace,
    windowSeconds: WINDOW_SECONDS,
  });
}
