import { submitPitch } from "@/lib/pitch/handlers";

// Verifies the uploaded deck and submits the pitch (§7.1, §15.3).
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/pitch/[slug]/submissions">,
): Promise<Response> {
  return submitPitch(request, (await params).slug);
}
