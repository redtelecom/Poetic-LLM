import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Settings2, 
  ShieldCheck, 
  Cpu,
  Zap,
  Box,
  Layers,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface ProviderConfig {
  id: string;
  name: string;
  isEnabled: boolean;
  selectedModel: string;
  models: { id: string; name: string; cost: string }[];
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    isEnabled: true,
    selectedModel: "gpt-4o",
    models: [
      { id: "gpt-4o", name: "GPT-4o", cost: "$5.00/1M" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", cost: "$10.00/1M" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", cost: "$0.50/1M" },
    ]
  },
  {
    id: "anthropic",
    name: "Anthropic",
    isEnabled: true,
    selectedModel: "claude-3-5-sonnet",
    models: [
      { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", cost: "$3.00/1M" },
      { id: "claude-3-opus", name: "Claude 3 Opus", cost: "$15.00/1M" },
      { id: "claude-3-haiku", name: "Claude 3 Haiku", cost: "$0.25/1M" },
    ]
  },
  {
    id: "google",
    name: "Google Vertex AI",
    isEnabled: false,
    selectedModel: "gemini-1.5-pro",
    models: [
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", cost: "$3.50/1M" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", cost: "$0.35/1M" },
    ]
  },
  {
    id: "xai",
    name: "xAI",
    isEnabled: false,
    selectedModel: "grok-beta",
    models: [
      { id: "grok-beta", name: "Grok Beta", cost: "Unknown" },
    ]
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    isEnabled: false,
    selectedModel: "llama-3-70b",
    models: [
      { id: "llama-3-70b", name: "Llama 3 70B", cost: "$0.70/1M" },
      { id: "mixtral-8x22b", name: "Mixtral 8x22B", cost: "$0.90/1M" },
    ]
  }
];

export default function SettingsTab() {
  const [providers, setProviders] = React.useState<ProviderConfig[]>(PROVIDERS);

  const handleToggleProvider = (id: string, checked: boolean) => {
    setProviders(prev => prev.map(p => 
      p.id === id ? { ...p, isEnabled: checked } : p
    ));
    if (checked) {
      toast({
        title: "Provider Enabled",
        description: `${providers.find(p => p.id === id)?.name} added to reasoning pool.`,
      });
    }
  };

  const handleModelChange = (providerId: string, modelId: string) => {
    setProviders(prev => prev.map(p => 
      p.id === providerId ? { ...p, selectedModel: modelId } : p
    ));
  };

  const handleSave = () => {
    const activeProviders = providers.filter(p => p.isEnabled);
    toast({
      title: "Configuration Saved",
      description: `Poetiq configured to mix ${activeProviders.length} models: ${activeProviders.map(p => p.name).join(", ")}`,
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
          <Settings2 className="w-6 h-6 text-indigo-600" />
          Multi-Model Configuration
        </h2>
        <p className="text-neutral-500">
          Poetiq uses a meta-system to orchestrate multiple LLMs simultaneously. Enable the providers you want to include in the reasoning mix.
        </p>
      </div>

      <div className="grid gap-6">
        <Card className="border-neutral-200 bg-white shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-neutral-500" />
              Active Reasoning Pool
            </CardTitle>
            <CardDescription>
              Select which models participate in the Poetiq orchestration layer. Using multiple high-tier models improves accuracy but increases cost.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {providers.map((provider) => (
              <div key={provider.id} className="flex items-start justify-between p-4 rounded-lg border border-neutral-100 bg-neutral-50/30 hover:bg-neutral-50 transition-colors">
                <div className="flex flex-col gap-3 flex-1 mr-6">
                  <div className="flex items-center gap-3">
                    <Switch 
                      id={`toggle-${provider.id}`}
                      checked={provider.isEnabled}
                      onCheckedChange={(checked) => handleToggleProvider(provider.id, checked)}
                    />
                    <Label htmlFor={`toggle-${provider.id}`} className="text-base font-semibold text-neutral-900 cursor-pointer">
                      {provider.name}
                    </Label>
                    {provider.isEnabled && (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                        Active
                      </Badge>
                    )}
                  </div>
                  
                  <div className="pl-14">
                    <div className="flex items-center gap-4">
                      <Label className="text-xs text-neutral-500 uppercase font-medium min-w-[60px]">Model</Label>
                      <Select 
                        value={provider.selectedModel} 
                        onValueChange={(val) => handleModelChange(provider.id, val)}
                        disabled={!provider.isEnabled}
                      >
                        <SelectTrigger className="w-[280px] h-9 bg-white text-sm">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-neutral-200 shadow-lg">
                          {provider.models.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              <div className="flex items-center justify-between w-full gap-4">
                                <span>{m.name}</span>
                                <span className="text-xs text-neutral-400 font-mono">{m.cost}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="hidden sm:flex flex-col items-end gap-1 text-xs text-neutral-400 font-mono pt-1">
                  <div className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-neutral-300" />
                    Secure Key
                  </div>
                </div>
              </div>
            ))}
            
            <div className="rounded-md bg-blue-50 p-4 border border-blue-100 flex gap-3">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-semibold mb-1">Poetiq Optimization Strategy</p>
                <p className="leading-relaxed opacity-90">
                  The system will automatically route sub-tasks to the enabled models based on their strengths (e.g., using Claude for code generation and GPT-4o for logical critique). 
                  Disabling a provider removes it from the potential reasoning paths.
                </p>
              </div>
            </div>

          </CardContent>
          <CardFooter className="bg-neutral-50/50 border-t border-neutral-100 flex justify-end items-center py-4">
             <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200">
               Save System Configuration
             </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
