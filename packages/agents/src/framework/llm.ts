import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmRequest, LlmResult } from "./types";

/** USD per million tokens [input, output]. Used for the cost column in agent_actions. */
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "claude-fable-5-1": [10, 50],
};

export function costUsdMicros(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model] ?? PRICES["claude-sonnet-5-5"]!;
  // $/MTok × tokens = micro-dollars
  return Math.round(p[0] * inputTokens + p[1] * outputTokens);
}

// Models that accept the effort parameter and server-side refusal fallbacks.
const SUPPORTS_EFFORT = /^claude-(opus|sonnet|fable)-/;
const SUPPORTS_FALLBACKS = /^claude-(opus-5|sonnet-5-5|fable-5-1)/;

export class AnthropicLlm implements LlmClient {
  private readonly client: Anthropic;
  readonly available = true;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    const withFallbacks = SUPPORTS_FALLBACKS.test(req.model);
    const response = await this.client.beta.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 4000,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
      ...(SUPPORTS_EFFORT.test(req.model) ? { output_config: { effort: req.effort ?? "low" } } : {}),
      // Server-side refusal fallback (routes a declined request to a fallback model).
      ...(withFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });

    if (response.stop_reason === "refusal") {
      throw new Error("The model declined this request");
    }
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("\n")
      .trim();
    const inputTokens = response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0);
    const outputTokens = response.usage.output_tokens;
    return {
      text,
      model: response.model,
      inputTokens,
      outputTokens,
      costUsdMicros: costUsdMicros(req.model, inputTokens, outputTokens),
      stopReason: response.stop_reason,
    };
  }
}

/** Used when no API key is configured: agents fall back to their templates. */
export class NoLlm implements LlmClient {
  readonly available = false;
  async complete(): Promise<LlmResult> {
    throw new Error("No ANTHROPIC_API_KEY configured");
  }
}

/** Scripted LLM for scenario tests. */
export class ScriptedLlm implements LlmClient {
  readonly available = true;
  readonly calls: LlmRequest[] = [];
  constructor(private readonly reply: (req: LlmRequest) => string) {}
  async complete(req: LlmRequest): Promise<LlmResult> {
    this.calls.push(req);
    const text = this.reply(req);
    return { text, model: req.model, inputTokens: 100, outputTokens: 50, costUsdMicros: costUsdMicros(req.model, 100, 50), stopReason: "end_turn" };
  }
}

export function llmFromEnv(env: Record<string, string | undefined> = process.env): LlmClient {
  const key = env.ANTHROPIC_API_KEY;
  return key ? new AnthropicLlm(key) : new NoLlm();
}
