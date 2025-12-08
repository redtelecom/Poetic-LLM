import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertConversationSchema, insertMessageSchema, insertSettingsSchema } from "@shared/schema";
import { PoetiqOrchestrator } from "./llm/orchestrator";
import type { ProviderConfig } from "./llm/providers";

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
      const pendingSteps: Array<{ provider: string; model: string; action: string; content: string; stepNumber: number }> = [];
      
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
        }
      )) {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ type: "content", content: chunk })}\n\n`);
      }

      const assistantMessage = await storage.createMessage({
        conversationId: req.params.id,
        role: "assistant",
        content: fullResponse,
        metadata: { providers: providers.filter((p: ProviderConfig) => p.enabled).map((p: ProviderConfig) => p.id) },
      });

      for (const step of pendingSteps) {
        await storage.createReasoningStep({
          messageId: assistantMessage.id,
          stepNumber: step.stepNumber,
          provider: step.provider,
          model: step.model,
          action: step.action,
          content: step.content,
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

  return httpServer;
}
