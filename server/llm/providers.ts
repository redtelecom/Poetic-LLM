import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

export const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export interface ProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  model: string;
}

export interface ReasoningStep {
  provider: string;
  model: string;
  action: string;
  content: string;
  tokenUsage?: TokenUsage;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StreamResult {
  content: string;
  usage: TokenUsage;
}

export async function callOpenAI(
  model: string,
  messages: Array<{ role: string; content: string }>
): Promise<{ content: string; usage: TokenUsage }> {
  const response = await openai.chat.completions.create({
    model,
    messages: messages as any,
    max_completion_tokens: 8192,
  });
  return {
    content: response.choices[0]?.message?.content || "",
    usage: {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
    }
  };
}

export async function callAnthropic(
  model: string,
  messages: Array<{ role: string; content: string }>
): Promise<{ content: string; usage: TokenUsage }> {
  const systemMessage = messages.find(m => m.role === "system");
  const userMessages = messages.filter(m => m.role !== "system");
  
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system: systemMessage?.content,
    messages: userMessages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content
    })),
  });

  const content = response.content[0];
  return {
    content: content.type === "text" ? content.text : "",
    usage: {
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    }
  };
}

export async function streamOpenAIWithUsage(
  model: string,
  messages: Array<{ role: string; content: string }>
): Promise<StreamResult> {
  const stream = await openai.chat.completions.create({
    model,
    messages: messages as any,
    max_completion_tokens: 8192,
    stream: true,
    stream_options: { include_usage: true },
  });

  let content = "";
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      content += delta;
    }
    if (chunk.usage) {
      usage = {
        inputTokens: chunk.usage.prompt_tokens || 0,
        outputTokens: chunk.usage.completion_tokens || 0,
      };
    }
  }

  return { content, usage };
}

export async function* streamOpenAI(
  model: string,
  messages: Array<{ role: string; content: string }>,
  onUsage?: (usage: TokenUsage) => void
): AsyncGenerator<string> {
  const stream = await openai.chat.completions.create({
    model,
    messages: messages as any,
    max_completion_tokens: 8192,
    stream: true,
    stream_options: { include_usage: true },
  });

  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  try {
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens || 0,
          outputTokens: chunk.usage.completion_tokens || 0,
        };
      }
    }
  } finally {
    onUsage?.(usage);
  }
}

export async function* streamAnthropic(
  model: string,
  messages: Array<{ role: string; content: string }>,
  onUsage?: (usage: TokenUsage) => void
): AsyncGenerator<string> {
  const systemMessage = messages.find(m => m.role === "system");
  const userMessages = messages.filter(m => m.role !== "system");
  
  const stream = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system: systemMessage?.content,
    messages: userMessages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content
    })),
    stream: true,
  });

  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
      if (event.type === "message_delta" && event.usage) {
        usage.outputTokens = event.usage.output_tokens || 0;
      }
      if (event.type === "message_start" && event.message?.usage) {
        usage.inputTokens = event.message.usage.input_tokens || 0;
      }
    }
  } finally {
    onUsage?.(usage);
  }
}
