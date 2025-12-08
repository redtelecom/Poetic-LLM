import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { 
  CheckCircle2, 
  Settings2, 
  ShieldCheck, 
  Cpu,
  Zap,
  Box
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  contextWindow: string;
  inputCost: string;
  outputCost: string;
  description: string;
  recommended?: boolean;
}

const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    contextWindow: "128k",
    inputCost: "$5.00",
    outputCost: "$15.00",
    description: "Most capable model, best for complex reasoning and coding tasks.",
    recommended: true
  },
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    contextWindow: "200k",
    inputCost: "$3.00",
    outputCost: "$15.00",
    description: "Excellent at nuanced writing and code generation with lower latency."
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "OpenAI",
    contextWindow: "128k",
    inputCost: "$10.00",
    outputCost: "$30.00",
    description: "Previous flagship model, reliable for varied tasks."
  },
  {
    id: "claude-3-opus",
    name: "Claude 3 Opus",
    provider: "Anthropic",
    contextWindow: "200k",
    inputCost: "$15.00",
    outputCost: "$75.00",
    description: "Highest capability for open-ended research and creative writing."
  },
  {
    id: "llama-3-70b",
    name: "Llama 3 70B",
    provider: "OpenRouter",
    contextWindow: "8k",
    inputCost: "$0.70",
    outputCost: "$0.90",
    description: "Fast, open-source alternative with strong reasoning capabilities."
  }
];

export default function SettingsTab() {
  const [selectedModel, setSelectedModel] = React.useState<string>("gpt-4o");

  const handleSave = () => {
    toast({
      title: "Settings Saved",
      description: `Active model updated to ${AVAILABLE_MODELS.find(m => m.id === selectedModel)?.name}`,
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
          <Settings2 className="w-6 h-6 text-indigo-600" />
          System Configuration
        </h2>
        <p className="text-neutral-500">
          Select the frontier model to power the Poetiq reasoning engine. API keys are managed securely via Replit Secrets.
        </p>
      </div>

      <div className="grid gap-6">
        <Card className="border-neutral-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-neutral-500" />
              Active Reasoning Model
            </CardTitle>
            <CardDescription>
              Choose which underlying LLM performs the step-by-step reasoning.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={selectedModel} onValueChange={setSelectedModel} className="grid gap-4">
              {AVAILABLE_MODELS.map((model) => (
                <div key={model.id}>
                  <RadioGroupItem value={model.id} id={model.id} className="peer sr-only" />
                  <Label
                    htmlFor={model.id}
                    className={cn(
                      "flex flex-col gap-2 rounded-lg border-2 border-neutral-100 p-4 hover:bg-neutral-50 hover:border-neutral-200 cursor-pointer transition-all",
                      selectedModel === model.id && "border-indigo-600 bg-indigo-50/10 hover:border-indigo-600 hover:bg-indigo-50/20 shadow-sm"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-900 text-base">{model.name}</span>
                        <Badge variant="outline" className="text-neutral-500 font-normal">
                          {model.provider}
                        </Badge>
                        {model.recommended && (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
                            Recommended
                          </Badge>
                        )}
                      </div>
                      {selectedModel === model.id && (
                        <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                      )}
                    </div>
                    
                    <p className="text-sm text-neutral-500 leading-relaxed">
                      {model.description}
                    </p>

                    <div className="flex items-center gap-4 mt-2 text-xs text-neutral-400 font-mono">
                      <div className="flex items-center gap-1">
                        <Box className="w-3 h-3" />
                        {model.contextWindow} ctx
                      </div>
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {model.inputCost} / 1M in
                      </div>
                    </div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
          <CardFooter className="bg-neutral-50/50 border-t border-neutral-100 flex justify-between items-center py-4">
             <div className="flex items-center gap-2 text-xs text-neutral-500">
               <ShieldCheck className="w-4 h-4 text-emerald-600" />
               Using secure credentials from Replit Secrets
             </div>
             <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white">
               Save Configuration
             </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
