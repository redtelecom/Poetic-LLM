import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sidebar } from "@/components/layout/Sidebar";
import SettingsTab from "@/components/settings/SettingsTab";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  Send, 
  Loader2, 
  User,
  Bot,
  Settings2,
  MessageCircle,
  Menu,
  Brain,
  CheckCircle2,
  Zap,
  Copy,
  Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { 
  fetchConversations, 
  fetchConversation, 
  createConversation, 
  deleteConversation,
  sendChatMessage,
  fetchSettings,
  fetchReasoningSteps,
  type ProviderConfig 
} from "@/lib/api";

interface ReasoningStep {
  id: number;
  provider: string;
  model: string;
  action: string;
  content: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
import type { Conversation, Message } from "@shared/schema";

export default function Chat() {
  const [activeTab, setActiveTab] = useState("chat");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [providers, setProviders] = useState<ProviderConfig[]>([
    { id: "openai", name: "OpenAI", enabled: true, model: "gpt-5" },
    { id: "anthropic", name: "Anthropic", enabled: true, model: "claude-sonnet-4-5" }
  ]);
  const [showReasoning, setShowReasoning] = useState(false);
  const [reasoningSteps, setReasoningSteps] = useState<ReasoningStep[]>([]);
  const [streamingReasoning, setStreamingReasoning] = useState<ReasoningStep[]>([]);
  const [tokenUsage, setTokenUsage] = useState<{ inputTokens: number; outputTokens: number } | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const copyToClipboard = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadConversations();
    loadSettings();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const loadConversations = async () => {
    try {
      const convs = await fetchConversations();
      setConversations(convs);
      if (convs.length > 0 && !activeConversationId) {
        setActiveConversationId(convs[0].id);
        loadConversation(convs[0].id);
      }
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  };

  const loadConversation = async (id: string) => {
    try {
      const { messages: msgs } = await fetchConversation(id);
      setMessages(msgs);
      
      const lastAssistantMessage = msgs.filter(m => m.role === "assistant").pop();
      if (lastAssistantMessage) {
        try {
          const steps = await fetchReasoningSteps(lastAssistantMessage.id);
          const formattedSteps: ReasoningStep[] = steps.map((s: any) => ({
            id: s.stepNumber,
            provider: s.provider,
            model: s.model,
            action: s.action,
            content: s.content
          }));
          setReasoningSteps(formattedSteps);
        } catch (err) {
          setReasoningSteps([]);
        }
      } else {
        setReasoningSteps([]);
      }
    } catch (error) {
      console.error("Failed to load conversation:", error);
    }
  };

  const loadSettings = async () => {
    try {
      const settings = await fetchSettings();
      if (settings.providers && Array.isArray(settings.providers) && settings.providers.length > 0) {
        setProviders(settings.providers as ProviderConfig[]);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const handleNewConversation = async () => {
    try {
      const newConv = await createConversation("New Chat");
      setConversations([newConv, ...conversations]);
      setActiveConversationId(newConv.id);
      setMessages([]);
      setActiveTab("chat");
    } catch (error) {
      console.error("Failed to create conversation:", error);
      toast({
        title: "Error",
        description: "Failed to create new conversation",
        variant: "destructive"
      });
    }
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    loadConversation(id);
    setActiveTab("chat");
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation(id);
      setConversations(conversations.filter(c => c.id !== id));
      if (activeConversationId === id) {
        const remaining = conversations.filter(c => c.id !== id);
        if (remaining.length > 0) {
          setActiveConversationId(remaining[0].id);
          loadConversation(remaining[0].id);
        } else {
          setActiveConversationId(null);
          setMessages([]);
        }
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const enabledProviders = providers.filter(p => p.enabled);
    if (enabledProviders.length === 0) {
      toast({
        title: "No providers enabled",
        description: "Please enable at least one LLM provider in settings.",
        variant: "destructive"
      });
      setActiveTab("settings");
      return;
    }

    let conversationId = activeConversationId;
    if (!conversationId) {
      try {
        const newConv = await createConversation("New Chat");
        setConversations([newConv, ...conversations]);
        conversationId = newConv.id;
        setActiveConversationId(conversationId);
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to create conversation",
          variant: "destructive"
        });
        return;
      }
    }

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);
    setStreamingContent("");
    setStreamingReasoning([]);
    setTokenUsage(null);

    const tempUserMessage: Message = {
      id: "temp-user-" + Date.now(),
      conversationId: conversationId,
      role: "user",
      content: userMessage,
      metadata: null,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, tempUserMessage]);

    let fullResponse = "";
    const collectedSteps: ReasoningStep[] = [];

    try {
      for await (const event of sendChatMessage(conversationId, userMessage, providers)) {
        if (event.type === "content") {
          fullResponse += event.content;
          setStreamingContent(fullResponse);
        } else if (event.type === "reasoning_step" && event.step) {
          const newStep: ReasoningStep = {
            id: event.step.stepNumber,
            provider: event.step.provider,
            model: event.step.model,
            action: event.step.action,
            content: event.step.content,
            tokenUsage: event.step.tokenUsage
          };
          collectedSteps.push(newStep);
          setStreamingReasoning([...collectedSteps]);
        } else if (event.type === "token_usage" && event.usage) {
          setTokenUsage(event.usage);
        } else if (event.type === "done") {
          setStreamingContent("");
          setStreamingReasoning([]);
          setReasoningSteps(collectedSteps);
          setIsLoading(false);
          await loadConversation(conversationId!);
          await loadConversations();
        } else if (event.type === "error") {
          throw new Error(event.error || "Unknown error");
        }
      }
    } catch (error) {
      console.error("Error during chat:", error);
      setIsLoading(false);
      setStreamingContent("");
      setStreamingReasoning([]);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900 flex overflow-hidden">
      <div className="hidden md:block w-72 h-screen sticky top-0">
        <Sidebar 
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
        />
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden -ml-2" data-testid="button-mobile-menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72">
                <Sidebar 
                  conversations={conversations}
                  activeId={activeConversationId}
                  onSelect={handleSelectConversation}
                  onNew={handleNewConversation}
                  onDelete={handleDeleteConversation}
                />
              </SheetContent>
            </Sheet>

            <div className="w-8 h-8 bg-indigo-600 rounded-md flex items-center justify-center text-white font-bold text-lg">
              P
            </div>
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-app-title">Poetiq Chat</h1>
            <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-200">
              Beta
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant={showReasoning ? "secondary" : "ghost"} 
              size="sm"
              onClick={() => setShowReasoning(!showReasoning)}
              className="gap-2"
              data-testid="button-reasoning-toggle"
            >
              <Brain className="w-4 h-4" />
              {showReasoning ? "Hide Reasoning" : "Show Reasoning"}
            </Button>
            <Button 
              variant={activeTab === "chat" ? "secondary" : "ghost"} 
              size="sm"
              onClick={() => setActiveTab("chat")}
              className="gap-2"
              data-testid="button-chat-tab"
            >
              <MessageCircle className="w-4 h-4" />
              Chat
            </Button>
            <Button 
              variant={activeTab === "settings" ? "secondary" : "ghost"} 
              size="sm"
              onClick={() => setActiveTab("settings")}
              className="gap-2"
              data-testid="button-settings-tab"
            >
              <Settings2 className="w-4 h-4" />
              Settings
            </Button>
          </div>
        </header>

        {activeTab === "settings" ? (
          <main className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              <SettingsTab providers={providers} onProvidersChange={setProviders} />
            </div>
          </main>
        ) : (
          <>
            <div className="flex-1 flex overflow-hidden">
              <main className={cn("flex-1 overflow-y-auto p-6", showReasoning && "lg:w-1/2")}>
                <div className="max-w-3xl mx-auto space-y-4">
                {messages.length === 0 && !streamingContent && (
                  <div className="text-center py-20 text-neutral-400">
                    <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <h2 className="text-xl font-medium text-neutral-600 mb-2">Start a conversation</h2>
                    <p className="text-sm">Send a message to begin chatting with the AI</p>
                  </div>
                )}

                {messages.map((message) => (
                  <div 
                    key={message.id}
                    className={cn(
                      "flex gap-3",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                    data-testid={`message-${message.id}`}
                  >
                    {message.role === "assistant" && (
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4 text-indigo-600" />
                      </div>
                    )}
                    <Card className={cn(
                      "max-w-[80%] p-4 relative group",
                      message.role === "user" 
                        ? "bg-indigo-600 text-white border-indigo-600" 
                        : "bg-white border-neutral-200"
                    )}>
                      {message.role === "user" ? (
                        <pre className="whitespace-pre-wrap font-sans text-sm text-white">
                          {message.content}
                        </pre>
                      ) : (
                        <>
                          <div className="prose prose-sm max-w-none prose-neutral">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content}
                            </ReactMarkdown>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0"
                            onClick={() => copyToClipboard(message.content, message.id)}
                            data-testid={`button-copy-${message.id}`}
                          >
                            {copiedMessageId === message.id ? (
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-neutral-500" />
                            )}
                          </Button>
                        </>
                      )}
                    </Card>
                    {message.role === "user" && (
                      <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-neutral-600" />
                      </div>
                    )}
                  </div>
                ))}

                {streamingContent && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-indigo-600" />
                    </div>
                    <Card className="max-w-[80%] p-4 bg-white border-neutral-200">
                      <div className="prose prose-sm max-w-none prose-neutral">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {streamingContent}
                        </ReactMarkdown>
                        <span className="inline-block w-2 h-4 bg-indigo-600 ml-1 animate-pulse" />
                      </div>
                    </Card>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </main>

              {showReasoning && (
                <aside className="hidden lg:block w-1/2 border-l border-neutral-200 bg-white overflow-y-auto p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Brain className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-lg font-semibold">Reasoning Process</h2>
                      </div>
                      {tokenUsage && (tokenUsage.inputTokens > 0 || tokenUsage.outputTokens > 0) && (
                        <div className="flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded" data-testid="text-reasoning-tokens" title="Total tokens for this message">
                          <Zap className="w-3 h-3" />
                          <span>Total: {tokenUsage.inputTokens.toLocaleString()} in / {tokenUsage.outputTokens.toLocaleString()} out</span>
                        </div>
                      )}
                    </div>
                    
                    {(isLoading ? streamingReasoning : reasoningSteps).length === 0 && !isLoading && (
                      <div className="text-center py-12 text-neutral-400">
                        <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>Reasoning steps will appear here</p>
                        <p className="text-sm mt-1">Send a message to see the AI's thinking process</p>
                      </div>
                    )}
                    
                    {(isLoading ? streamingReasoning : reasoningSteps).map((step, index) => (
                      <div 
                        key={step.id} 
                        className="relative pl-8"
                        data-testid={`reasoning-step-${step.id}`}
                      >
                        {index !== (isLoading ? streamingReasoning : reasoningSteps).length - 1 && (
                          <div className="absolute left-[11px] top-6 w-[2px] h-[calc(100%+16px)] bg-indigo-200" />
                        )}
                        
                        <div className="absolute left-0 top-0 w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 bg-indigo-600 text-white border-indigo-600">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        
                        <Card className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge className="text-[10px] bg-indigo-100 text-indigo-700 border-indigo-200">
                                {step.provider}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                {step.action}
                              </Badge>
                            </div>
                            {step.tokenUsage && (step.tokenUsage.inputTokens > 0 || step.tokenUsage.outputTokens > 0) && (
                              <div className="flex items-center gap-1 text-[10px] text-indigo-600" data-testid={`tokens-step-${step.id}`}>
                                <Zap className="w-3 h-3" />
                                <span>{step.tokenUsage.inputTokens.toLocaleString()} / {step.tokenUsage.outputTokens.toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-neutral-700">{step.content}</p>
                          <p className="text-xs text-neutral-500 mt-1">Model: {step.model}</p>
                        </Card>
                      </div>
                    ))}
                    
                    {isLoading && streamingReasoning.length > 0 && (
                      <div className="flex items-center gap-2 text-indigo-600 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing...</span>
                      </div>
                    )}
                  </div>
                </aside>
              )}
            </div>

            <footer className="bg-white border-t border-neutral-200 p-4 shrink-0">
              <div className="max-w-3xl mx-auto">
                <div className="flex gap-3">
                  <Textarea
                    ref={textareaRef}
                    placeholder="Type your message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="min-h-[50px] max-h-[200px] resize-none flex-1"
                    disabled={isLoading}
                    data-testid="input-chat-message"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white h-auto px-6"
                    data-testid="button-send-message"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-neutral-500">
                  <span>Press Enter to send, Shift+Enter for new line</span>
                  <div className="flex items-center gap-3">
                    {tokenUsage && (
                      <div className="flex items-center gap-1 text-indigo-600" data-testid="text-token-usage" title="Total tokens for this message">
                        <Zap className="w-3 h-3" />
                        <span>Total: {tokenUsage.inputTokens.toLocaleString()} in / {tokenUsage.outputTokens.toLocaleString()} out</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      {providers.filter(p => p.enabled).map(p => (
                        <Badge key={p.id} variant="outline" className="text-xs">
                          {p.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
