import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertConversationSchema, insertMessageSchema, insertSettingsSchema } from "@shared/schema";
import { PoetiqOrchestrator } from "./llm/orchestrator";
import type { ProviderConfig, TokenUsage } from "./llm/providers";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

function parsePoetiqResponse(fullResponse: string): { review: string | null; enhancedResponse: string } {
  const reviewMatch = fullResponse.match(/##\s*Review of Previous Response\s*([\s\S]*?)(?=##\s*Enhanced Response|$)/i);
  const enhancedMatch = fullResponse.match(/##\s*Enhanced Response\s*([\s\S]*)/i);
  
  if (reviewMatch && enhancedMatch) {
    return {
      review: reviewMatch[1].trim(),
      enhancedResponse: enhancedMatch[1].trim()
    };
  }
  
  return {
    review: null,
    enhancedResponse: fullResponse
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/conversations", async (req, res) => {
    try {
      const conversations = await storage.getConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id", async (req, res) => {
    try {
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await storage.getMessages(req.params.id);
      res.json({ conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", async (req, res) => {
    try {
      const data = insertConversationSchema.parse(req.body);
      const conversation = await storage.createConversation(data);
      res.json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(400).json({ error: "Invalid conversation data" });
    }
  });

  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      await storage.deleteConversation(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  app.post("/api/conversations/:id/solve", async (req, res) => {
    try {
      const { message, providers } = req.body;
      
      if (!message || !providers) {
        return res.status(400).json({ error: "Message and providers required" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const userMessage = await storage.createMessage({
        conversationId: req.params.id,
        role: "user",
        content: message,
        metadata: null,
      });

      const orchestrator = new PoetiqOrchestrator(providers as ProviderConfig[]);
      let fullResponse = "";
      let stepNumber = 0;
      const pendingSteps: Array<{ provider: string; model: string; action: string; content: string; stepNumber: number; tokenUsage?: { inputTokens: number; outputTokens: number } }> = [];
      let tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
      
      for await (const chunk of orchestrator.solveTask(
        message,
        (step) => {
          stepNumber++;
          const stepData = { ...step, stepNumber };
          pendingSteps.push(stepData);
          res.write(`data: ${JSON.stringify({ 
            type: "reasoning_step", 
            step: stepData 
          })}\n\n`);
        },
        (usage) => {
          tokenUsage = usage;
        }
      )) {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ type: "content", content: chunk })}\n\n`);
      }

      const { review, enhancedResponse } = parsePoetiqResponse(fullResponse);
      
      if (review) {
        stepNumber++;
        const reviewStep = {
          provider: "poetiq",
          model: "multi-model",
          action: "review",
          content: review,
          stepNumber
        };
        pendingSteps.push(reviewStep);
        res.write(`data: ${JSON.stringify({ 
          type: "reasoning_step", 
          step: reviewStep 
        })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ type: "token_usage", usage: tokenUsage })}\n\n`);

      const assistantMessage = await storage.createMessage({
        conversationId: req.params.id,
        role: "assistant",
        content: enhancedResponse,
        metadata: { 
          providers: providers.filter((p: ProviderConfig) => p.enabled).map((p: ProviderConfig) => p.id),
          tokenUsage
        },
      });

      for (const step of pendingSteps) {
        await storage.createReasoningStep({
          messageId: assistantMessage.id,
          stepNumber: step.stepNumber,
          provider: step.provider,
          model: step.model,
          action: step.action,
          content: step.content,
          inputTokens: step.tokenUsage?.inputTokens ?? null,
          outputTokens: step.tokenUsage?.outputTokens ?? null,
        });
      }

      const messages = await storage.getMessages(req.params.id);
      if (messages.length === 2) {
        const title = await orchestrator.generateTitle(message);
        await storage.updateConversation(req.params.id, { title });
      }

      res.write(`data: ${JSON.stringify({ type: "done", messageId: assistantMessage.id })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error solving task:", error);
      res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to process request" })}\n\n`);
      res.end();
    }
  });

  app.get("/api/messages/:id/reasoning", async (req, res) => {
    try {
      const steps = await storage.getReasoningSteps(req.params.id);
      res.json(steps);
    } catch (error) {
      console.error("Error fetching reasoning steps:", error);
      res.status(500).json({ error: "Failed to fetch reasoning steps" });
    }
  });

  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings || { providers: [] });
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const data = insertSettingsSchema.parse(req.body);
      const settings = await storage.updateSettings(data);
      res.json(settings);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(400).json({ error: "Invalid settings data" });
    }
  });

  app.post("/api/conversations/:id/chat", async (req, res) => {
    const SLIDING_WINDOW_SIZE = 10;
    const SUMMARY_TRIGGER_COUNT = 6;
    
    try {
      const { message, providers } = req.body;
      
      if (!message || !providers) {
        return res.status(400).json({ error: "Message and providers required" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      await storage.createMessage({
        conversationId: req.params.id,
        role: "user",
        content: message,
        metadata: null,
      });

      const existingMessages = await storage.getMessages(req.params.id);
      const existingSummary = await storage.getConversationSummary(req.params.id);
      
      const recentMessages = existingMessages.slice(-SLIDING_WINDOW_SIZE);
      
      const conversationHistory: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
      
      if (existingSummary) {
        conversationHistory.push({
          role: "system",
          content: `Previous conversation summary:\n${existingSummary.summary}`
        });
      }
      
      for (const m of recentMessages) {
        conversationHistory.push({
          role: m.role as "user" | "assistant",
          content: m.content
        });
      }

      const orchestrator = new PoetiqOrchestrator(providers as ProviderConfig[]);
      let fullResponse = "";
      let stepNumber = 0;
      const pendingSteps: Array<{ provider: string; model: string; action: string; content: string; stepNumber: number; tokenUsage?: { inputTokens: number; outputTokens: number } }> = [];
      let tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

      const contextPrompt = conversationHistory.length > 1 
        ? `Based on this conversation:\n${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nRespond to the latest message.`
        : message;

      for await (const chunk of orchestrator.solveTask(
        contextPrompt,
        (step) => {
          stepNumber++;
          const stepData = { ...step, stepNumber };
          pendingSteps.push(stepData);
          res.write(`data: ${JSON.stringify({ 
            type: "reasoning_step", 
            step: stepData 
          })}\n\n`);
        },
        (usage) => {
          tokenUsage = usage;
        }
      )) {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ type: "content", content: chunk })}\n\n`);
      }

      const { review, enhancedResponse } = parsePoetiqResponse(fullResponse);
      
      if (review) {
        stepNumber++;
        const reviewStep = {
          provider: "poetiq",
          model: "multi-model",
          action: "review",
          content: review,
          stepNumber
        };
        pendingSteps.push(reviewStep);
        res.write(`data: ${JSON.stringify({ 
          type: "reasoning_step", 
          step: reviewStep 
        })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ type: "token_usage", usage: tokenUsage })}\n\n`);

      const assistantMessage = await storage.createMessage({
        conversationId: req.params.id,
        role: "assistant",
        content: enhancedResponse,
        metadata: { 
          providers: providers.filter((p: ProviderConfig) => p.enabled).map((p: ProviderConfig) => p.id),
          tokenUsage
        },
      });

      for (const step of pendingSteps) {
        await storage.createReasoningStep({
          messageId: assistantMessage.id,
          stepNumber: step.stepNumber,
          provider: step.provider,
          model: step.model,
          action: step.action,
          content: step.content,
          inputTokens: step.tokenUsage?.inputTokens ?? null,
          outputTokens: step.tokenUsage?.outputTokens ?? null,
        });
      }

      const allMessages = await storage.getMessages(req.params.id);
      
      if (allMessages.length === 2) {
        const title = await orchestrator.generateTitle(message);
        await storage.updateConversation(req.params.id, { title });
      }

      const lastSummaryCount = existingSummary?.messageCount || 0;
      const messagesSinceLastSummary = allMessages.length - lastSummaryCount;
      const turnsSinceLastSummary = Math.floor(messagesSinceLastSummary / 2);
      
      if (turnsSinceLastSummary >= SUMMARY_TRIGGER_COUNT && allMessages.length > SLIDING_WINDOW_SIZE) {
        const messagesToSummarize = allMessages.slice(0, -SLIDING_WINDOW_SIZE);
        const summaryContent = messagesToSummarize.map(m => 
          `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 500)}${m.content.length > 500 ? "..." : ""}`
        ).join("\n\n");
        
        const summaryPrompt = `Summarize this conversation history into a concise summary. Include:
- User's main goals and requests
- Key decisions made
- Important context and information shared
- Open questions or pending items

Conversation:
${summaryContent}

Provide a concise summary (2-3 paragraphs max):`;

        try {
          const summary = await orchestrator.generateSummary(summaryPrompt);
          await storage.upsertConversationSummary({
            conversationId: req.params.id,
            summary,
            messageCount: allMessages.length,
          });
        } catch (summaryError) {
          console.error("Error generating summary:", summaryError);
        }
      }

      res.write(`data: ${JSON.stringify({ type: "done", messageId: assistantMessage.id })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error in chat:", error);
      res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to process request" })}\n\n`);
      res.end();
    }
  });

  app.post("/api/objects/upload", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/attachments", async (req, res) => {
    try {
      const { type, mimeType, fileName, size, storageKey, url } = req.body;
      
      if (!type || !mimeType || !storageKey) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const attachment = await storage.createAttachment({
        type,
        mimeType,
        fileName,
        size,
        storageKey,
        url,
      });
      
      res.json(attachment);
    } catch (error) {
      console.error("Error creating attachment:", error);
      res.status(500).json({ error: "Failed to create attachment" });
    }
  });

  app.get("/api/attachments/:messageId", async (req, res) => {
    try {
      const attachments = await storage.getAttachmentsByMessage(req.params.messageId);
      res.json(attachments);
    } catch (error) {
      console.error("Error fetching attachments:", error);
      res.status(500).json({ error: "Failed to fetch attachments" });
    }
  });

  return httpServer;
}
