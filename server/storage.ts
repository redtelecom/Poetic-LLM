import { 
  type Conversation, 
  type InsertConversation,
  type Message,
  type InsertMessage,
  type ReasoningStep,
  type InsertReasoningStep,
  type Settings,
  type InsertSettings,
  type ConversationSummary,
  type InsertConversationSummary,
  type Attachment,
  type InsertAttachment,
  conversations,
  messages,
  reasoningSteps,
  settings,
  conversationSummaries,
  attachments,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;
  updateConversation(id: string, updates: Partial<InsertConversation>): Promise<Conversation | undefined>;
  
  getMessages(conversationId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  
  getReasoningSteps(messageId: string): Promise<ReasoningStep[]>;
  createReasoningStep(step: InsertReasoningStep): Promise<ReasoningStep>;
  
  getSettings(): Promise<Settings | undefined>;
  updateSettings(settingsData: InsertSettings): Promise<Settings>;
  
  getConversationSummary(conversationId: string): Promise<ConversationSummary | undefined>;
  upsertConversationSummary(data: InsertConversationSummary): Promise<ConversationSummary>;
  
  createAttachment(attachment: InsertAttachment): Promise<Attachment>;
  getAttachmentsByMessage(messageId: string): Promise<Attachment[]>;
  updateAttachmentMessage(attachmentId: string, messageId: string): Promise<Attachment | undefined>;
}

export class PostgresStorage implements IStorage {
  async getConversations(): Promise<Conversation[]> {
    const result = await db.select().from(conversations).orderBy(desc(conversations.updatedAt));
    return result;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const result = await db.select().from(conversations).where(eq(conversations.id, id));
    return result[0];
  }

  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const result = await db.insert(conversations).values(conversation).returning();
    return result[0];
  }

  async deleteConversation(id: string): Promise<void> {
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async updateConversation(id: string, updates: Partial<InsertConversation>): Promise<Conversation | undefined> {
    const result = await db.update(conversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return result[0];
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    const result = await db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.timestamp);
    return result;
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const result = await db.insert(messages).values(message).returning();
    return result[0];
  }

  async getReasoningSteps(messageId: string): Promise<ReasoningStep[]> {
    const result = await db.select().from(reasoningSteps)
      .where(eq(reasoningSteps.messageId, messageId))
      .orderBy(reasoningSteps.stepNumber);
    return result;
  }

  async createReasoningStep(step: InsertReasoningStep): Promise<ReasoningStep> {
    const result = await db.insert(reasoningSteps).values(step).returning();
    return result[0];
  }

  async getSettings(): Promise<Settings | undefined> {
    const result = await db.select().from(settings).limit(1);
    return result[0];
  }

  async updateSettings(settingsData: InsertSettings): Promise<Settings> {
    const existing = await this.getSettings();
    
    if (existing) {
      const result = await db.update(settings)
        .set({ ...settingsData, updatedAt: new Date() })
        .where(eq(settings.id, existing.id))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(settings).values(settingsData).returning();
      return result[0];
    }
  }

  async getConversationSummary(conversationId: string): Promise<ConversationSummary | undefined> {
    const result = await db.select().from(conversationSummaries)
      .where(eq(conversationSummaries.conversationId, conversationId))
      .limit(1);
    return result[0];
  }

  async upsertConversationSummary(data: InsertConversationSummary): Promise<ConversationSummary> {
    const existing = await this.getConversationSummary(data.conversationId);
    
    if (existing) {
      const result = await db.update(conversationSummaries)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(conversationSummaries.id, existing.id))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(conversationSummaries).values(data).returning();
      return result[0];
    }
  }

  async createAttachment(attachment: InsertAttachment): Promise<Attachment> {
    const result = await db.insert(attachments).values(attachment).returning();
    return result[0];
  }

  async getAttachmentsByMessage(messageId: string): Promise<Attachment[]> {
    const result = await db.select().from(attachments)
      .where(eq(attachments.messageId, messageId));
    return result;
  }

  async updateAttachmentMessage(attachmentId: string, messageId: string): Promise<Attachment | undefined> {
    const result = await db.update(attachments)
      .set({ messageId })
      .where(eq(attachments.id, attachmentId))
      .returning();
    return result[0];
  }
}

export const storage = new PostgresStorage();
