import { presignDeck } from "@/lib/pitch/handlers";

// Presigns a deck upload for the public pitch form (§15.3).
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/pitch/[slug]/uploads">,
): Promise<Response> {
  return presignDeck(request, (await params).slug);
}
