import { z } from "zod";

// The pitch form routes' JSON responses. Client-safe (zod only): the browser
// parses every response with these instead of trusting its shape.

export const presignResponseSchema = z.strictObject({
  key: z.string().min(1),
  url: z.url({ protocol: /^https$/ }),
  headers: z.record(z.string(), z.string()),
});
export type PresignResponse = z.infer<typeof presignResponseSchema>;

// A refusal the founder can act on. `reupload`: the deck upload is gone or
// unusable, so the founder must choose the file again.
export const refusalResponseSchema = z.strictObject({
  error: z.string().min(1),
  reupload: z.boolean(),
});
export type RefusalResponse = z.infer<typeof refusalResponseSchema>;
