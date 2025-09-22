import { getPreferenceValues } from "@raycast/api";
import { PromptFrontMatter } from "./prompt-types";

export interface SendPromptOptions {
  prompt: string;
  frontMatter: PromptFrontMatter;
  context?: Record<string, unknown>;
}

export interface SendPromptResult {
  output: string;
  tokensUsed?: number;
}

interface ProviderPreferences {
  openaiModel?: string;
  openaiTemperature?: string;
  openaiMaxTokens?: string;
  enableSend: boolean;
  openaiApiKey?: string;
  openaiApiEndpoint?: string;
}

const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_ENDPOINT = "https://api.openai.com/v1/responses";

export async function sendPromptToOpenAI(
  options: SendPromptOptions,
): Promise<SendPromptResult> {
  const preferences = getPreferenceValues<ProviderPreferences>();
  if (!preferences.enableSend) {
    throw new Error("Sending is disabled in preferences.");
  }

  const apiKey =
    preferences.openaiApiKey?.trim() ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenAI API key not configured. Add it in the extension preferences.",
    );
  }

  const model =
    options.frontMatter.model?.name ?? preferences.openaiModel ?? DEFAULT_MODEL;
  const rawTemperature =
    options.frontMatter.model?.temperature ?? preferences.openaiTemperature;
  const parsedTemperature =
    typeof rawTemperature === "number"
      ? rawTemperature
      : parseFloat(rawTemperature ?? "");
  const temperature = Number.isFinite(parsedTemperature)
    ? parsedTemperature
    : 0.2;

  const rawMaxTokens =
    options.frontMatter.model?.max_tokens ?? preferences.openaiMaxTokens;
  const parsedMaxTokens =
    typeof rawMaxTokens === "number"
      ? rawMaxTokens
      : Number(rawMaxTokens ?? "");
  const maxOutputTokens =
    Number.isFinite(parsedMaxTokens) && parsedMaxTokens > 0
      ? parsedMaxTokens
      : 512;

  const requestBody = {
    model,
    temperature,
    max_output_tokens: maxOutputTokens,
    messages: [
      {
        role: "user",
        content: options.prompt,
      },
    ],
  };

  const endpoint = preferences.openaiApiEndpoint?.trim() || DEFAULT_ENDPOINT;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const message = await safeReadError(response);
    throw new Error(`OpenAI request failed: ${message}`);
  }

  const json = (await response.json()) as {
    output: Array<{ content: Array<{ text?: { value: string } }> }>;
    usage?: { total_tokens?: number };
  };

  const output = json.output?.[0]?.content?.[0]?.text?.value ?? "";

  return {
    output,
    tokensUsed: json.usage?.total_tokens,
  };
}

async function safeReadError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return response.statusText;
  }
}
