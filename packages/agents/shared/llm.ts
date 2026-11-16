// The Gemini client (§14.4, llm-call skill). The only file that imports the
// Google Gen AI SDK. Exported as @shortlist/agents-shared/llm, which only the
// worker's entry point imports; agents use ctx.llm.
import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  type Content,
  type GenerateContentResponse,
  type Part,
} from "@google/genai";
import { z } from "zod";
import { describeIssues } from "./issues";
import { costMicros, type ModelId } from "./models";
import { UNTRUSTED_NOTICE } from "./prompt";
import {
  InvalidModelOutputError,
  MODEL_REQUEST_TIMEOUT_MS,
  ProviderError,
  type LlmClient,
  type LlmPart,
  type LlmUsage,
  type StructuredRequest,
} from "./runtime";

// One HTTP request's limit. A request that hangs past it is a provider
// timeout (retried); the attempt as a whole is bounded by the agent's
// timeoutSeconds, which agentRegistry requires to be longer.
const REQUEST_TIMEOUT_MS = MODEL_REQUEST_TIMEOUT_MS;

export type GeminiOptions = {
  apiKey: string;
  // Requests per minute for this worker process (env LLM_RPM, validated
  // there as a positive integer).
  rpm: number;
  // The HTTP client. Tests pass a stub; the worker leaves it out.
  fetch?: typeof fetch;
};

// One per worker process: every attempt's client shares the rate limiter.
// Returns the factory for a run attempt's client, bound to its abort signal.
export function geminiClients(
  options: GeminiOptions,
): (signal: AbortSignal) => LlmClient {
  const ai = new GoogleGenAI({
    apiKey: options.apiKey,
    httpOptions: {
      timeout: REQUEST_TIMEOUT_MS,
      // No retryOptions: the SDK doesn't retry. Provider errors retry the
      // run through pg-boss (§11.2).
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    },
  });
  const waitForSlot = rateLimiter(options.rpm);
  return (signal) => attemptClient(ai, waitForSlot, signal);
}

function attemptClient(
  ai: GoogleGenAI,
  waitForSlot: (signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
): LlmClient {
  const total: LlmUsage = { tokensIn: 0, tokensOut: 0, costMicros: 0 };

  // One request. Its usage is counted before its output is checked. A
  // blocked prompt or a stop other than STOP fails the call: a corrective
  // retry wouldn't change either.
  async function generate(
    model: ModelId,
    system: string,
    schema: unknown,
    contents: Content[],
  ): Promise<string | undefined> {
    let response: GenerateContentResponse;
    try {
      await waitForSlot(signal);
      response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: `${system}\n\n${UNTRUSTED_NOTICE}`,
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          abortSignal: signal,
        },
      });
    } catch (error) {
      throw callError(error, model, signal);
    }
    const usage = response.usageMetadata;
    if (usage === undefined) {
      throw new Error(`Gemini ${model} response has no usage metadata`);
    }
    // The API leaves out counts that are zero.
    const tokensIn =
      (usage.promptTokenCount ?? 0) + (usage.toolUsePromptTokenCount ?? 0);
    const tokensOut =
      (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
    total.tokensIn += tokensIn;
    total.tokensOut += tokensOut;
    total.costMicros += costMicros(model, tokensIn, tokensOut);

    const blocked = response.promptFeedback?.blockReason;
    if (blocked !== undefined) {
      throw new Error(`Gemini ${model} blocked: ${blocked}`);
    }
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason !== FinishReason.STOP) {
      throw new Error(
        `Gemini ${model} stopped: finishReason ${finishReason ?? "missing"}`,
      );
    }
    return response.text;
  }

  return {
    async structured<T>(request: StructuredRequest<T>): Promise<T> {
      const schema = responseSchema(request.schema);
      const prompt: Content = { role: "user", parts: toParts(request.input) };

      const first = await generate(request.model, request.system, schema, [
        prompt,
      ]);
      const checked = check(request.schema, first);
      if (checked.ok) {
        return checked.value;
      }

      // The one corrective retry: the prompt again, and where the previous
      // answer broke the schema. The answer itself isn't sent back, and the
      // issues name only the schema's side (describeIssues), so nothing the
      // answer contained returns as an instruction.
      const retry: Content[] = [
        prompt,
        {
          role: "user",
          parts: [
            {
              text: `Your previous response did not match the required JSON schema:\n${checked.issues}\nReturn a corrected response that matches the schema.`,
            },
          ],
        },
      ];
      const second = check(
        request.schema,
        await generate(request.model, request.system, schema, retry),
      );
      if (second.ok) {
        return second.value;
      }
      throw new InvalidModelOutputError(
        `${request.model} output for ${request.promptVersion} is invalid after one corrective retry:\n${second.issues}`,
      );
    },
    usage: () => ({ ...total }),
  };
}

// Zod -> the JSON Schema Gemini takes as responseJsonSchema. "input"
// because the model writes what the schema parses: a transform's input side
// is sent, and refinements, which JSON Schema can't express, are checked on
// return. Agent schemas don't use .default(): it makes the field optional
// for the model, and a default would fill in what the model left out.
export function responseSchema(schema: z.ZodType): Record<string, unknown> {
  const json: Record<string, unknown> = {
    ...z.toJSONSchema(schema, { io: "input" }),
  };
  // Gemini's supported keywords don't include $schema.
  delete json.$schema;
  return json;
}

function toParts(input: readonly LlmPart[]): Part[] {
  return input.map((part) =>
    part.kind === "text"
      ? { text: part.text }
      : {
          inlineData: {
            mimeType: "image/png",
            data: Buffer.from(part.data).toString("base64"),
          },
        },
  );
}

type Checked<T> = { ok: true; value: T } | { ok: false; issues: string };

function check<T>(schema: z.ZodType<T>, text: string | undefined): Checked<T> {
  if (text === undefined || text === "") {
    return { ok: false, issues: "- (root): the response contained no JSON" };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    // Recorded as the issue the corrective retry is given.
    return {
      ok: false,
      issues: `- (root): not valid JSON (${error instanceof Error ? error.name : "parse error"})`,
    };
  }
  const parsed = schema.safeParse(json);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, issues: describeIssues(schema, parsed.error) };
}

// HTTP statuses that retry the run: request timeout, rate limit or quota,
// and server errors. Every other 4xx is a request the provider refused and
// would refuse again (bad schema, bad key, unknown model), so the run fails.
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

const REASONS: Readonly<Record<number, string>> = {
  400: "invalid argument",
  401: "unauthenticated",
  403: "permission denied",
  404: "not found",
  408: "request timeout",
  413: "request too large",
  429: "rate limit or quota exceeded",
  500: "internal error",
  502: "bad gateway",
  503: "unavailable",
  504: "deadline exceeded",
};

// The error a failed request becomes. Messages are built here from the
// status alone: the SDK's message and cause can echo prompt content, and
// would end up in agent_run.error.
function callError(error: unknown, model: ModelId, signal: AbortSignal): Error {
  if (signal.aborted) {
    return new Error(
      `Gemini ${model} call stopped: the run attempt was aborted`,
    );
  }
  if (error instanceof ApiError) {
    const message = `Gemini ${model} returned HTTP ${String(error.status)} (${REASONS[error.status] ?? "error"})`;
    return isRetryableStatus(error.status)
      ? new ProviderError(message)
      : new Error(message);
  }
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    // Our signal isn't aborted, so this is the request timeout.
    return new ProviderError(
      `Gemini ${model} call timed out after ${String(REQUEST_TIMEOUT_MS / 1000)}s`,
    );
  }
  if (isNetworkFailure(error)) {
    return new ProviderError(`Gemini ${model} call failed: network error`);
  }
  const name = error instanceof Error ? error.name : typeof error;
  console.error(`Gemini ${model} call failed (${name}):`, error);
  return new Error(
    `Gemini ${model} call failed without an HTTP status (${name})`,
  );
}

// Node's fetch (undici) failing without a response: "fetch failed" when it
// can't connect (refused, reset, DNS), "terminated" when the socket closes
// mid-response, or an error whose code is UND_ERR_SOCKET.
function isNetworkFailure(error: unknown): boolean {
  if (
    error instanceof TypeError &&
    (error.message === "fetch failed" || error.message === "terminated")
  ) {
    return true;
  }
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if ("code" in e && e.code === "UND_ERR_SOCKET") {
      return true;
    }
  }
  return false;
}

// Spaces calls evenly at `rpm` per minute across this process, so a deck's
// calls queue instead of hitting 429s (§14.4). It never retries.
export function rateLimiter(
  rpm: number,
): (signal: AbortSignal) => Promise<void> {
  const spacingMs = 60_000 / rpm;
  let nextAt = Number.NEGATIVE_INFINITY;
  return (signal) => {
    signal.throwIfAborted();
    const now = Date.now();
    const at = Math.max(now, nextAt);
    nextAt = at + spacingMs;
    return at === now ? Promise.resolve() : sleep(at - now, signal);
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason as Error);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
