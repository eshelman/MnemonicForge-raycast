import { getPreferenceValues } from "@raycast/api";
import { PromptFrontMatter } from "./prompt-types";

export interface SendPromptResult {
  output: string;
  tokensUsed?: number;
}

interface ResponsesApiResult {
  output?: Array<{
    type: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
  usage?: { total_tokens?: number };
}

const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_ENDPOINT = "https://api.openai.com/v1/responses";

function parseOptionalNumber(value?: string): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function sendPromptToOpenAI(
  prompt: string,
  frontMatter: PromptFrontMatter,
): Promise<SendPromptResult> {
  const preferences = getPreferenceValues<Preferences.Prompts>();
  const apiKey = preferences.openaiApiKey?.trim();
  if (!apiKey) {
    throw new Error(
      "OpenAI API key not configured. Add it in the extension preferences.",
    );
  }

  const body: Record<string, unknown> = {
    model:
      frontMatter.model?.name ??
      (preferences.openaiModel?.trim() || DEFAULT_MODEL),
    input: prompt,
  };

  // Only send sampling limits when explicitly configured: reasoning models reject
  // `temperature`, and reasoning tokens count against `max_output_tokens`.
  const temperature =
    frontMatter.model?.temperature ??
    parseOptionalNumber(preferences.openaiTemperature);
  if (temperature !== undefined) {
    body.temperature = temperature;
  }
  const maxTokens =
    frontMatter.model?.max_tokens ??
    parseOptionalNumber(preferences.openaiMaxTokens);
  if (maxTokens && maxTokens > 0) {
    body.max_output_tokens = maxTokens;
  }

  const response = await fetch(
    preferences.openaiApiEndpoint?.trim() || DEFAULT_ENDPOINT,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`OpenAI request failed: ${detail.slice(0, 500)}`);
  }

  const json = (await response.json()) as ResponsesApiResult;
  const output = (json.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("");

  return { output, tokensUsed: json.usage?.total_tokens };
}
