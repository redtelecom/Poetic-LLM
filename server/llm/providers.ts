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

export const openrouter = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY
});

export interface ProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  model: string;
  isCustom?: boolean;
  baseUrl?: string;
  apiKey?: string;
}

const customClientCache = new Map<string, OpenAI>();

export function getCustomClient(provider: ProviderConfig): OpenAI {
  if (!provider.baseUrl) {
    throw new Error(`Custom provider ${provider.name} requires a baseUrl`);
  }
  
  const cacheKey = `${provider.id}:${provider.baseUrl}`;
  let client = customClientCache.get(cacheKey);
  
  if (!client) {
    client = new OpenAI({
      baseURL: provider.baseUrl,
      apiKey: provider.apiKey || "not-required"
    });
    customClientCache.set(cacheKey, client);
  }
  
  return client;
}

export async function callCustomProvider(
  provider: ProviderConfig,
  messages: Array<MessageContent>
): Promise<{ content: string; usage: TokenUsage }> {
  const client = getCustomClient(provider);
  const formattedMessages = buildOpenAIMessages(messages);
  
  const response = await client.chat.completions.create({
    model: provider.model,
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

export async function* streamCustomProvider(
  provider: ProviderConfig,
  messages: Array<MessageContent>,
  onUsage?: (usage: TokenUsage) => void
): AsyncGenerator<string> {
  const client = getCustomClient(provider);
  const formattedMessages = buildOpenAIMessages(messages);
  
  const stream = await client.chat.completions.create({
    model: provider.model,
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
        const prepared = prepareImageForAPI(img);
        if (prepared) {
          // OpenAI expects full data URL format
          content.push({
            type: "image_url",
            image_url: { url: prepared.dataUrl }
          });
        } else {
          console.warn('[Image] Skipping invalid image attachment for OpenAI:', img.mimeType);
        }
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
  // Use [\s\S]+ instead of .+ to match across potential whitespace/newlines in base64
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (match) {
    // Clean the base64 data - remove any whitespace that might have been introduced
    const cleanedData = match[2].replace(/\s/g, '');
    return { mediaType: match[1], data: cleanedData };
  }
  return null;
}

// Detect actual image format from base64 data by checking magic bytes
function detectImageFormat(base64Data: string): string | null {
  try {
    // Need at least 16 bytes decoded to detect WebP (check bytes 0-3 and 8-11)
    // 16 bytes requires 24 base64 characters (ceil(16/3)*4 = 24)
    // Use 24 chars to ensure proper base64 decoding (multiple of 4)
    const charsNeeded = 24;
    if (base64Data.length < charsNeeded) {
      return null;
    }
    
    const decoded = Buffer.from(base64Data.slice(0, charsNeeded), 'base64');
    if (decoded.length < 12) {
      return null;
    }
    
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (decoded[0] === 0x89 && decoded[1] === 0x50 && decoded[2] === 0x4E && decoded[3] === 0x47) {
      return 'image/png';
    }
    // JPEG: FF D8 FF
    if (decoded[0] === 0xFF && decoded[1] === 0xD8 && decoded[2] === 0xFF) {
      return 'image/jpeg';
    }
    // GIF: 47 49 46 38
    if (decoded[0] === 0x47 && decoded[1] === 0x49 && decoded[2] === 0x46 && decoded[3] === 0x38) {
      return 'image/gif';
    }
    // WebP: 52 49 46 46 ... 57 45 42 50
    if (decoded[0] === 0x52 && decoded[1] === 0x49 && decoded[2] === 0x46 && decoded[3] === 0x46 &&
        decoded[8] === 0x57 && decoded[9] === 0x45 && decoded[10] === 0x42 && decoded[11] === 0x50) {
      return 'image/webp';
    }
    return null;
  } catch {
    return null;
  }
}

// Validate and fix image data for API consumption
function prepareImageForAPI(img: { mimeType: string; url: string }): { mediaType: string; base64Data: string; dataUrl: string } | null {
  const parsed = parseDataUrl(img.url);
  if (!parsed) {
    console.error('[Image] Failed to parse data URL');
    return null;
  }
  
  // Detect actual format and use it if declared type doesn't match
  const detectedFormat = detectImageFormat(parsed.data);
  const mediaType = detectedFormat || parsed.mediaType;
  
  if (detectedFormat && detectedFormat !== parsed.mediaType) {
    console.log(`[Image] Format mismatch: declared ${parsed.mediaType}, detected ${detectedFormat}. Using detected.`);
  }
  
  // Reconstruct clean data URL for OpenAI
  const dataUrl = `data:${mediaType};base64,${parsed.data}`;
  
  return {
    mediaType,
    base64Data: parsed.data,
    dataUrl
  };
}

function buildAnthropicMessages(messages: Array<MessageContent>): any[] {
  return messages.filter(m => m.role !== "system").map(m => {
    if (m.images && m.images.length > 0) {
      const content: any[] = [{ type: "text", text: m.content }];
      for (const img of m.images) {
        const prepared = prepareImageForAPI(img);
        if (prepared) {
          // Anthropic expects raw base64 data (NOT data URL prefix)
          content.push({
            type: "image",
            source: {
              type: "base64",
              media_type: prepared.mediaType,
              data: prepared.base64Data
            }
          });
        } else {
          console.warn('[Image] Skipping invalid image attachment for Anthropic:', img.mimeType);
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

export async function callOpenRouter(
  model: string,
  messages: Array<MessageContent>
): Promise<{ content: string; usage: TokenUsage }> {
  const formattedMessages = buildOpenAIMessages(messages);
  const response = await openrouter.chat.completions.create({
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

export async function* streamOpenRouter(
  model: string,
  messages: Array<MessageContent>,
  onUsage?: (usage: TokenUsage) => void
): AsyncGenerator<string> {
  const formattedMessages = buildOpenAIMessages(messages);
  
  const stream = await openrouter.chat.completions.create({
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
