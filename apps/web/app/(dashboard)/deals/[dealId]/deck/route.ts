import { dealDeckResponse } from "@/lib/deals/deck-response";

// The deal's deck PDF for the deck viewer, after authorization (§15.3).
export async function GET(
  _request: Request,
  { params }: RouteContext<"/deals/[dealId]/deck">,
): Promise<Response> {
  return dealDeckResponse((await params).dealId);
}
