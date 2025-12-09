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

export interface ImageAttachment {
  type: "image";
  mimeType: string;
  url: string;
}

export interface MessageContent {
  role: string;
  content: string;
  images?: ImageAttachment[];
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
  messages: Array<MessageContent>
): Promise<{ content: string; usage: TokenUsage }> {
  const formattedMessages = buildOpenAIMessages(messages);
  const response = await openai.chat.completions.create({
    model,
    messages: formattedMessages,
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
  messages: Array<MessageContent>
): Promise<{ content: string; usage: TokenUsage }> {
  const systemMessage = messages.find(m => m.role === "system");
  const formattedMessages = buildAnthropicMessages(messages);
  
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system: systemMessage?.content,
    messages: formattedMessages,
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

function buildOpenAIMessages(messages: Array<MessageContent>): any[] {
  return messages.map(m => {
    if (m.images && m.images.length > 0) {
      const content: any[] = [{ type: "text", text: m.content }];
      for (const img of m.images) {
        content.push({
          type: "image_url",
          image_url: { url: img.url }
        });
      }
      return { role: m.role, content };
    }
    return { role: m.role, content: m.content };
  });
}

export async function* streamOpenAI(
  model: string,
  messages: Array<MessageContent>,
  onUsage?: (usage: TokenUsage) => void
): AsyncGenerator<string> {
  const formattedMessages = buildOpenAIMessages(messages);
  
  const stream = await openai.chat.completions.create({
    model,
    messages: formattedMessages,
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

function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mediaType: match[1], data: match[2] };
  }
  return null;
}

function buildAnthropicMessages(messages: Array<MessageContent>): any[] {
  return messages.filter(m => m.role !== "system").map(m => {
    if (m.images && m.images.length > 0) {
      const content: any[] = [{ type: "text", text: m.content }];
      for (const img of m.images) {
        // Parse data URL to extract base64 data
        const parsed = parseDataUrl(img.url);
        if (parsed) {
          content.push({
            type: "image",
            source: {
              type: "base64",
              media_type: parsed.mediaType,
              data: parsed.data
            }
          });
        } else {
          // For regular URLs, try URL format (may not be supported by all models)
          content.push({
            type: "image",
            source: {
              type: "url",
              url: img.url
            }
          });
        }
      }
      return { role: m.role as "user" | "assistant", content };
    }
    return { role: m.role as "user" | "assistant", content: m.content };
  });
}

export async function* streamAnthropic(
  model: string,
  messages: Array<MessageContent>,
  onUsage?: (usage: TokenUsage) => void
): AsyncGenerator<string> {
  const systemMessage = messages.find(m => m.role === "system");
  const formattedMessages = buildAnthropicMessages(messages);
  
  const stream = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system: systemMessage?.content,
    messages: formattedMessages,
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
