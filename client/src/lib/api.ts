import type { Conversation, Message, ReasoningStep, Settings } from "@shared/schema";

export async function fetchConversations(): Promise<Conversation[]> {
  const response = await fetch("/api/conversations");
  if (!response.ok) throw new Error("Failed to fetch conversations");
  return response.json();
}

export async function fetchConversation(id: string): Promise<{ conversation: Conversation; messages: Message[] }> {
  const response = await fetch(`/api/conversations/${id}`);
  if (!response.ok) throw new Error("Failed to fetch conversation");
  return response.json();
}

export async function createConversation(title: string): Promise<Conversation> {
  const response = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) throw new Error("Failed to create conversation");
  return response.json();
}

export async function deleteConversation(id: string): Promise<void> {
  const response = await fetch(`/api/conversations/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete conversation");
}

export interface ProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  model: string;
}

export interface StreamEvent {
  type: "content" | "reasoning_step" | "done" | "error" | "token_usage";
  content?: string;
  step?: {
    provider: string;
    model: string;
    action: string;
    content: string;
    stepNumber: number;
    tokenUsage?: {
      inputTokens: number;
      outputTokens: number;
    };
  };
  messageId?: string;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export async function* solveTask(
  conversationId: string,
  message: string,
  providers: ProviderConfig[]
): AsyncGenerator<StreamEvent> {
  const response = await fetch(`/api/conversations/${conversationId}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, providers }),
  });

  if (!response.ok) throw new Error("Failed to start solving");
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const event: StreamEvent = JSON.parse(data);
            yield event;
          } catch (e) {
            console.error("Failed to parse SSE data:", data);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function fetchReasoningSteps(messageId: string): Promise<ReasoningStep[]> {
  const response = await fetch(`/api/messages/${messageId}/reasoning`);
  if (!response.ok) throw new Error("Failed to fetch reasoning steps");
  return response.json();
}

export async function fetchSettings(): Promise<Settings> {
  const response = await fetch("/api/settings");
  if (!response.ok) throw new Error("Failed to fetch settings");
  return response.json();
}

export async function updateSettings(providers: any): Promise<Settings> {
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providers }),
  });
  if (!response.ok) throw new Error("Failed to update settings");
  return response.json();
}

export async function* sendChatMessage(
  conversationId: string,
  message: string,
  providers: ProviderConfig[]
): AsyncGenerator<StreamEvent> {
  const response = await fetch(`/api/conversations/${conversationId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, providers }),
  });

  if (!response.ok) throw new Error("Failed to send message");
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const event: StreamEvent = JSON.parse(data);
            yield event;
          } catch (e) {
            console.error("Failed to parse SSE data:", data);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
