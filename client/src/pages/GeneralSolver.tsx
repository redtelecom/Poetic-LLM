import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import SettingsTab from "@/components/settings/SettingsTab";
import { Sidebar } from "@/components/layout/Sidebar";
import { 
  Brain, 
  Sparkles, 
  MessageSquare, 
  CheckCircle2, 
  Loader2, 
  Zap, 
  Settings2,
  Menu,
  ChevronDown,
  ChevronUp
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
  solveTask,
  fetchSettings,
  fetchReasoningSteps,
  type ProviderConfig 
} from "@/lib/api";
import type { Conversation, Message } from "@shared/schema";

interface ReasoningStep {
  id: number;
  provider: string;
  model: string;
  action: string;
  content: string;
  status: "pending" | "active" | "completed";
}

export default function GeneralSolver() {
  const [activeTab, setActiveTab] = useState("solver");
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reasoningSteps, setReasoningSteps] = useState<ReasoningStep[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [computeBudget, setComputeBudget] = useState([50]);
  const [expandedSteps, setExpandedSteps] = useState<number[]>([]);
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([
    { id: "openai", name: "OpenAI", enabled: true, model: "gpt-5" },
    { id: "anthropic", name: "Anthropic", enabled: true, model: "claude-sonnet-4-5" }
  ]);

  useEffect(() => {
    loadConversations();
    loadSettings();
  }, []);

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
      const { conversation, messages: msgs } = await fetchConversation(id);
      setMessages(msgs);
      
      const lastUserMessage = msgs.filter(m => m.role === "user").pop();
      const lastAssistantMessage = msgs.filter(m => m.role === "assistant").pop();
      
      if (lastUserMessage && !isProcessing) {
        setPrompt(lastUserMessage.content);
      }
      
      if (lastAssistantMessage) {
        setResult(lastAssistantMessage.content);
        
        try {
          const steps = await fetchReasoningSteps(lastAssistantMessage.id);
          const formattedSteps: ReasoningStep[] = steps.map((s: any) => ({
            id: s.stepNumber,
            provider: s.provider,
            model: s.model,
            action: s.action,
            content: s.content,
            status: "completed" as const
          }));
          setReasoningSteps(formattedSteps);
        } catch (err) {
          console.error("Failed to load reasoning steps:", err);
          setReasoningSteps([]);
        }
      } else {
        setResult(null);
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

  const toggleStep = (id: number) => {
    setExpandedSteps(prev => 
      prev.includes(id) ? prev.filter(stepId => stepId !== id) : [...prev, id]
    );
  };

  const handleNewConversation = async () => {
    try {
      const newConv = await createConversation("New Task");
      setConversations([newConv, ...conversations]);
      setActiveConversationId(newConv.id);
      setPrompt("");
      setResult(null);
      setReasoningSteps([]);
      setMessages([]);
      setActiveTab("solver");
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
    setActiveTab("solver");
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
          handleNewConversation();
        }
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  const handleRun = async () => {
    if (!prompt.trim()) {
      toast({
        title: "Input required",
        description: "Please enter a prompt to start the reasoning process.",
        variant: "destructive"
      });
      return;
    }

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

    if (!activeConversationId) {
      await handleNewConversation();
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setReasoningSteps([]);
    setResult(null);

    let responseText = "";
    let stepCounter = 0;

    try {
      for await (const event of solveTask(activeConversationId, prompt, providers)) {
        if (event.type === "content") {
          responseText += event.content;
          setResult(responseText);
        } else if (event.type === "reasoning_step" && event.step) {
          stepCounter++;
          const newStep: ReasoningStep = {
            id: stepCounter,
            provider: event.step.provider,
            model: event.step.model,
            action: event.step.action,
            content: event.step.content,
            status: "completed"
          };
          setReasoningSteps(prev => [...prev, newStep]);
          setProgress(Math.min((stepCounter / 7) * 100, 95));
        } else if (event.type === "done") {
          setProgress(100);
          setIsProcessing(false);
          await loadConversations();
          toast({
            title: "Reasoning Complete",
            description: "The system has finished processing your request.",
          });
        } else if (event.type === "error") {
          throw new Error(event.error || "Unknown error");
        }
      }
    } catch (error) {
      console.error("Error during solve:", error);
      setIsProcessing(false);
      toast({
        title: "Error",
        description: "Failed to process request. Please try again.",
        variant: "destructive"
      });
    }
  };

  const activeConversation = conversations.find(c => c.id === activeConversationId);

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
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-app-title">Poetiq Solver</h1>
            <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-200">
              Beta
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
             <Button 
               variant={activeTab === "solver" ? "secondary" : "ghost"} 
               size="sm"
               onClick={() => setActiveTab("solver")}
               className="gap-2"
               data-testid="button-solver-tab"
             >
               <Brain className="w-4 h-4" />
               Solver
             </Button>
             <Link href="/chat">
               <Button 
                 variant="ghost" 
                 size="sm"
                 className="gap-2"
                 data-testid="button-chat-link"
               >
                 <MessageSquare className="w-4 h-4" />
                 Chat
               </Button>
             </Link>
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

        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto w-full">
            {activeTab === "settings" ? (
              <SettingsTab providers={providers} onProvidersChange={setProviders} />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-20">
                <div className="lg:col-span-4 flex flex-col gap-6">
                  <Card className="border-neutral-200 shadow-sm bg-white">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <MessageSquare className="w-5 h-5 text-indigo-600" />
                        Input Task
                      </CardTitle>
                      <CardDescription>
                        Describe a complex problem requiring multi-step reasoning.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Textarea 
                        placeholder="E.g., Design a scalable architecture for a real-time chat app using WebSockets and Redis..."
                        className="min-h-[150px] resize-none text-base focus-visible:ring-indigo-500"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        data-testid="input-task-prompt"
                      />
                      
                      <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-neutral-700 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-500" />
                            Compute Budget
                          </label>
                          <span className="text-sm text-neutral-500" data-testid="text-compute-budget">{computeBudget}%</span>
                        </div>
                        <Slider 
                          value={computeBudget} 
                          onValueChange={setComputeBudget} 
                          max={100} 
                          step={1} 
                          className="py-2"
                        />
                        <p className="text-xs text-neutral-500">
                          Higher budget allows for deeper search trees and more self-correction iterations.
                        </p>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-2">
                      <Button 
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200" 
                        size="lg"
                        onClick={handleRun}
                        disabled={isProcessing}
                        data-testid="button-start-reasoning"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Reasoning...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Start Reasoning
                          </>
                        )}
                      </Button>
                    </CardFooter>
                  </Card>

                  <Card className="border-neutral-200 shadow-sm bg-neutral-50/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-neutral-600 flex items-center gap-2">
                        <Settings2 className="w-4 h-4" />
                        Active Configuration
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="p-3 bg-white rounded-md border border-neutral-200">
                         <div className="flex items-center justify-between mb-2">
                           <span className="text-sm font-medium">Enabled Providers</span>
                           <Badge variant="outline" className="text-xs" data-testid="badge-enabled-count">
                             {providers.filter(p => p.enabled).length} Active
                           </Badge>
                         </div>
                         <div className="flex gap-2 flex-wrap">
                           {providers.filter(p => p.enabled).map(p => (
                             <Badge 
                               key={p.id} 
                               variant="secondary" 
                               className="bg-blue-50 text-blue-700 hover:bg-blue-100"
                               data-testid={`badge-provider-${p.id}`}
                             >
                               {p.name}: {p.model}
                             </Badge>
                           ))}
                           {providers.filter(p => p.enabled).length === 0 && (
                             <span className="text-sm text-neutral-500">No providers enabled</span>
                           )}
                         </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="lg:col-span-8 flex flex-col gap-6">
                  <Card className={cn("border-neutral-200 shadow-sm transition-all duration-500 bg-white", isProcessing ? "ring-2 ring-indigo-500/20" : "")}>
                    <CardHeader className="pb-4 border-b border-neutral-100">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                          <Brain className="w-5 h-5 text-indigo-600" />
                          Reasoning Process
                        </CardTitle>
                        {isProcessing && (
                           <div className="flex items-center gap-2 text-sm text-indigo-600 font-medium animate-pulse">
                             <Loader2 className="w-4 h-4 animate-spin" />
                             Processing...
                           </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-6 space-y-6 bg-neutral-50/30">
                        {reasoningSteps.length === 0 && !isProcessing && (
                          <div className="text-center py-12 text-neutral-400">
                            <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>Reasoning steps will appear here during processing</p>
                          </div>
                        )}
                        {reasoningSteps.map((step, index) => {
                          const isExpanded = expandedSteps.includes(step.id);

                          return (
                            <div 
                              key={step.id} 
                              className="relative pl-8 transition-all duration-500"
                              data-testid={`reasoning-step-${step.id}`}
                            >
                              {index !== reasoningSteps.length - 1 && (
                                <div className="absolute left-[11px] top-6 w-[2px] h-[calc(100%+24px)] bg-indigo-200" />
                              )}

                              <div className="absolute left-0 top-0 w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 bg-white border-indigo-600 bg-indigo-600 text-white">
                                <CheckCircle2 className="w-4 h-4" />
                              </div>

                              <div 
                                className="bg-white p-4 rounded-lg border border-neutral-200 shadow-sm hover:shadow-md transition-shadow"
                                data-testid={`reasoning-step-toggle-${step.id}`}
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge className="text-[10px] bg-indigo-100 text-indigo-700 border-indigo-200">
                                    {step.provider}
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px]">
                                    {step.action}
                                  </Badge>
                                </div>
                                <div className="relative">
                                  <div 
                                    className={cn(
                                      "text-sm text-neutral-700 font-medium overflow-hidden transition-all duration-200",
                                      !isExpanded && "max-h-[48px]"
                                    )}
                                    style={!isExpanded ? { 
                                      WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                                      maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)'
                                    } : undefined}
                                  >
                                    {step.content}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                  <p className="text-xs text-neutral-500">Model: {step.model}</p>
                                  <button
                                    onClick={() => toggleStep(step.id)}
                                    className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors px-2 py-1 rounded hover:bg-indigo-50"
                                    data-testid={`button-expand-step-${step.id}`}
                                  >
                                    {isExpanded ? (
                                      <>
                                        <ChevronUp className="w-4 h-4" />
                                        Collapse
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="w-4 h-4" />
                                        Expand
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {result && (
                    <Card className="border-neutral-200 shadow-sm bg-white">
                      <CardHeader className="pb-3 border-b border-neutral-100">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Sparkles className="w-5 h-5 text-emerald-600" />
                          Solution
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="prose prose-sm max-w-none" data-testid="text-solution">
                          <pre className="whitespace-pre-wrap text-neutral-800 leading-relaxed">{result}</pre>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
