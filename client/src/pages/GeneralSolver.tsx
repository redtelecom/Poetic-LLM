import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SettingsTab from "@/components/settings/SettingsTab";
import { 
  Brain, 
  Sparkles, 
  MessageSquare, 
  CheckCircle2, 
  Loader2, 
  Zap, 
  FileText,
  Settings2,
  ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

// Mock reasoning steps for visualization
const MOCK_REASONING_STEPS = [
  { id: 1, type: "plan", content: "Analyzing request and decomposing into sub-tasks...", status: "pending" },
  { id: 2, type: "thought", content: "Identifying key constraints and required knowledge...", status: "pending" },
  { id: 3, type: "search", content: "Retrieving relevant context from knowledge base...", status: "pending" },
  { id: 4, type: "draft", content: "Generating initial solution hypothesis...", status: "pending" },
  { id: 5, type: "critique", content: "Verifying logical consistency and edge cases...", status: "pending" },
  { id: 6, type: "refine", content: "Refining output based on critique...", status: "pending" },
  { id: 7, type: "final", content: "Formatting final response...", status: "pending" },
];

export default function GeneralSolver() {
  const [activeTab, setActiveTab] = useState("solver");
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [computeBudget, setComputeBudget] = useState([50]);
  const [expandedSteps, setExpandedSteps] = useState<number[]>([]);

  const toggleStep = (id: number) => {
    setExpandedSteps(prev => 
      prev.includes(id) ? prev.filter(stepId => stepId !== id) : [...prev, id]
    );
  };

  const handleRun = () => {
    if (!prompt.trim()) {
      toast({
        title: "Input required",
        description: "Please enter a prompt to start the reasoning process.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setActiveStep(1);
    setCompletedSteps([]);
    setResult(null);

    // Simulate the reasoning process
    let currentStep = 1;
    const interval = setInterval(() => {
      if (currentStep > MOCK_REASONING_STEPS.length) {
        clearInterval(interval);
        setIsProcessing(false);
        setResult(`Here is the result for your request: "${prompt.substring(0, 30)}..."\n\nBased on the iterative reasoning process, I have arrived at the following solution:\n\n1. First, I analyzed the core requirements.\n2. I identified potential edge cases regarding user input.\n3. The optimal approach involves a hybrid strategy.\n\nFinal Conclusion:\nThe solution requires balancing the compute budget with the desired accuracy depth. By applying the Poetiq meta-reasoning layer, we improved the zero-shot performance by approximately 45%.`);
        toast({
          title: "Reasoning Complete",
          description: "The system has finished processing your request.",
        });
        return;
      }

      setCompletedSteps(prev => [...prev, currentStep]);
      setActiveStep(currentStep + 1);
      setProgress((currentStep / MOCK_REASONING_STEPS.length) * 100);
      currentStep++;
    }, 1500); // 1.5s per step
  };

  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-md flex items-center justify-center text-white font-bold text-lg">
            P
          </div>
          <h1 className="text-xl font-bold tracking-tight">Poetiq Solver</h1>
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
           >
             <Brain className="w-4 h-4" />
             Solver
           </Button>
           <Button 
             variant={activeTab === "settings" ? "secondary" : "ghost"} 
             size="sm"
             onClick={() => setActiveTab("settings")}
             className="gap-2"
           >
             <Settings2 className="w-4 h-4" />
             Settings
           </Button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {activeTab === "settings" ? (
          <SettingsTab />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Input & Configuration */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              <Card className="border-neutral-200 shadow-sm">
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
                  />
                  
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-neutral-700 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        Compute Budget
                      </label>
                      <span className="text-sm text-neutral-500">{computeBudget}%</span>
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
                    System Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-white rounded-md border border-neutral-200 text-center">
                      <div className="text-xs text-neutral-500 uppercase font-semibold mb-1">Model</div>
                      <div className="font-medium text-neutral-900">GPT-4o</div>
                    </div>
                    <div className="p-3 bg-white rounded-md border border-neutral-200 text-center">
                      <div className="text-xs text-neutral-500 uppercase font-semibold mb-1">Method</div>
                      <div className="font-medium text-neutral-900">Tree-of-Thought</div>
                    </div>
                  </div>
                  <div className="p-3 bg-white rounded-md border border-neutral-200">
                     <div className="flex items-center justify-between mb-2">
                       <span className="text-sm font-medium">Active Modules</span>
                       <Badge variant="outline" className="text-xs">3 Enabled</Badge>
                     </div>
                     <div className="flex gap-2 flex-wrap">
                       <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100">Code Verifier</Badge>
                       <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Logic Check</Badge>
                       <Badge variant="secondary" className="bg-purple-50 text-purple-700 hover:bg-purple-100">Web Search</Badge>
                     </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Visualization & Output */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              
              {/* Reasoning Chain Visualization */}
              <Card className={cn("border-neutral-200 shadow-sm transition-all duration-500", isProcessing ? "ring-2 ring-indigo-500/20" : "")}>
                <CardHeader className="pb-4 border-b border-neutral-100">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-indigo-600" />
                      Reasoning Process
                    </CardTitle>
                    {isProcessing && (
                       <div className="flex items-center gap-2 text-sm text-indigo-600 font-medium animate-pulse">
                         <Loader2 className="w-4 h-4 animate-spin" />
                         Processing Step {activeStep}/{MOCK_REASONING_STEPS.length}
                       </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-6 space-y-6 bg-neutral-50/30">
                    {MOCK_REASONING_STEPS.map((step, index) => {
                      const isActive = step.id === activeStep;
                      const isCompleted = completedSteps.includes(step.id);
                      const isPending = !isActive && !isCompleted;
                      const isExpanded = expandedSteps.includes(step.id);

                      return (
                        <div 
                          key={step.id} 
                          className={cn(
                            "relative pl-8 transition-all duration-500",
                            isPending ? "opacity-40 grayscale" : "opacity-100"
                          )}
                        >
                          {/* Timeline Line */}
                          {index !== MOCK_REASONING_STEPS.length - 1 && (
                            <div className={cn(
                              "absolute left-[11px] top-6 w-[2px] h-[calc(100%+24px)] bg-neutral-200",
                              isCompleted ? "bg-indigo-200" : ""
                            )} />
                          )}

                          {/* Status Icon */}
                          <div className={cn(
                            "absolute left-0 top-0 w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 bg-white transition-colors duration-300",
                            isActive ? "border-indigo-600 text-indigo-600 scale-110 shadow-indigo-100 shadow-lg" : 
                            isCompleted ? "border-indigo-600 bg-indigo-600 text-white" : 
                            "border-neutral-300 text-neutral-300"
                          )}>
                            {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : 
                             isActive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                             <span className="text-[10px] font-bold">{step.id}</span>}
                          </div>

                          {/* Content Card */}
                          <div 
                            className={cn(
                              "rounded-lg border bg-white p-3 transition-all duration-300 hover:shadow-md cursor-pointer",
                              isActive ? "border-indigo-500 shadow-md ring-1 ring-indigo-500/10" : "border-neutral-200"
                            )}
                            onClick={() => toggleStep(step.id)}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={cn(
                                    "text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                                    step.type === 'plan' ? "bg-blue-50 text-blue-700 border-blue-200" :
                                    step.type === 'thought' ? "bg-amber-50 text-amber-700 border-amber-200" :
                                    step.type === 'search' ? "bg-purple-50 text-purple-700 border-purple-200" :
                                    step.type === 'critique' ? "bg-red-50 text-red-700 border-red-200" :
                                    "bg-neutral-100 text-neutral-600 border-neutral-200"
                                  )}>
                                    {step.type}
                                  </span>
                                  <span className="text-xs text-neutral-400 font-mono">
                                    {isCompleted ? "245ms" : isActive ? "Running..." : "Pending"}
                                  </span>
                                </div>
                                <p className="text-sm font-medium text-neutral-800">{step.content}</p>
                              </div>
                              {isCompleted && (
                                 <ChevronDown className={cn("w-4 h-4 text-neutral-400 transition-transform", isExpanded ? "rotate-180" : "")} />
                              )}
                            </div>
                            
                            {/* Expandable Details */}
                            {isExpanded && isCompleted && (
                              <div className="mt-3 pt-3 border-t border-neutral-100 text-xs text-neutral-600 font-mono bg-neutral-50 rounded p-2">
                                <p>{`> Executing module: ${step.type}_v2`}</p>
                                <p>{`> Context window: 45% used`}</p>
                                <p>{`> Confidence score: 0.92`}</p>
                                <p className="text-emerald-600">{`> Step verification passed`}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Final Output */}
              <div className="flex-1">
                 <Card className={cn("h-full border-neutral-200 shadow-md transition-opacity duration-500", result ? "opacity-100" : "opacity-50 grayscale")}>
                   <CardHeader className="bg-neutral-50/80 border-b border-neutral-100 py-3">
                     <div className="flex items-center justify-between">
                       <CardTitle className="text-base flex items-center gap-2">
                         <FileText className="w-4 h-4 text-neutral-500" />
                         Final Solution
                       </CardTitle>
                       {result && (
                         <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1">
                           <CheckCircle2 className="w-3 h-3" />
                           Verified
                         </Badge>
                       )}
                     </div>
                   </CardHeader>
                   <CardContent className="p-6">
                     {result ? (
                       <div className="prose prose-sm max-w-none text-neutral-800">
                         <p className="whitespace-pre-line leading-relaxed">{result}</p>
                       </div>
                     ) : (
                       <div className="h-40 flex flex-col items-center justify-center text-neutral-400 gap-3">
                         <Brain className="w-12 h-12 opacity-20" />
                         <p>Output will appear here after reasoning is complete</p>
                       </div>
                     )}
                   </CardContent>
                 </Card>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}
