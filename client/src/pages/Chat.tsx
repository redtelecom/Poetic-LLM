import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sidebar } from "@/components/layout/Sidebar";
import SettingsTab from "@/components/settings/SettingsTab";
import { 
  Send, 
  Loader2, 
  User,
  Bot,
  Settings2,
  MessageCircle,
  Menu,
  Brain
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Link } from "wouter";
import { 
  fetchConversations, 
  fetchConversation, 
  createConversation, 
  deleteConversation,
  sendChatMessage,
  fetchSettings,
  type ProviderConfig 
} from "@/lib/api";
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

    try {
      for await (const event of sendChatMessage(conversationId, userMessage, providers)) {
        if (event.type === "content") {
          fullResponse += event.content;
          setStreamingContent(fullResponse);
        } else if (event.type === "done") {
          setStreamingContent("");
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
            <Link href="/">
              <Button 
                variant="ghost" 
                size="sm"
                className="gap-2"
                data-testid="button-solver-link"
              >
                <Brain className="w-4 h-4" />
                Solver
              </Button>
            </Link>
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
            <main className="flex-1 overflow-y-auto p-6">
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
                      "max-w-[80%] p-4",
                      message.role === "user" 
                        ? "bg-indigo-600 text-white border-indigo-600" 
                        : "bg-white border-neutral-200"
                    )}>
                      <div className="prose prose-sm max-w-none">
                        <pre className={cn(
                          "whitespace-pre-wrap font-sans text-sm",
                          message.role === "user" ? "text-white" : "text-neutral-800"
                        )}>
                          {message.content}
                        </pre>
                      </div>
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
                      <div className="prose prose-sm max-w-none">
                        <pre className="whitespace-pre-wrap font-sans text-sm text-neutral-800">
                          {streamingContent}
                          <span className="inline-block w-2 h-4 bg-indigo-600 ml-1 animate-pulse" />
                        </pre>
                      </div>
                    </Card>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </main>

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
                  <div className="flex gap-2">
                    {providers.filter(p => p.enabled).map(p => (
                      <Badge key={p.id} variant="outline" className="text-xs">
                        {p.name}
                      </Badge>
                    ))}
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
