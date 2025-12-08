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
}

export async function callOpenAI(
  model: string,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const response = await openai.chat.completions.create({
    model,
    messages: messages as any,
    max_completion_tokens: 8192,
  });
  return response.choices[0]?.message?.content || "";
}

export async function callAnthropic(
  model: string,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
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
  return content.type === "text" ? content.text : "";
}

export async function* streamOpenAI(
  model: string,
  messages: Array<{ role: string; content: string }>
): AsyncGenerator<string> {
  const stream = await openai.chat.completions.create({
    model,
    messages: messages as any,
    max_completion_tokens: 8192,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

export async function* streamAnthropic(
  model: string,
  messages: Array<{ role: string; content: string }>
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

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}
