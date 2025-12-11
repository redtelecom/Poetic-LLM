import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Settings2, 
  ShieldCheck, 
  Layers,
  Info,
  Plus,
  Trash2,
  Link,
  GitBranch
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { updateSettings, type ConsensusMode } from "@/lib/api";
import type { ProviderConfig } from "@/lib/api";

interface Model {
  id: string;
  name: string;
  cost: string;
}

const PROVIDER_MODELS: Record<string, Model[]> = {
  openai: [
    { id: "gpt-5", name: "GPT-5", cost: "$15.00/1M" },
    { id: "gpt-4o", name: "GPT-4o", cost: "$5.00/1M" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", cost: "$0.15/1M" },
  ],
  anthropic: [
    { id: "claude-opus-4-5", name: "Claude Opus 4.5", cost: "$15.00/1M" },
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", cost: "$3.00/1M" },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", cost: "$0.25/1M" },
  ],
  openrouter: [
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", cost: "$0.35/1M" },
    { id: "meta-llama/llama-3.1-405b-instruct", name: "Llama 3.1 405B", cost: "$2.00/1M" },
    { id: "mistralai/mistral-large-2411", name: "Mistral Large", cost: "$2.00/1M" },
    { id: "mistralai/mistral-small-2503", name: "Mistral Small", cost: "$0.10/1M" },
    { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B", cost: "$0.35/1M" },
    { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek Chat V3", cost: "$0.14/1M" },
    { id: "deepseek/deepseek-r1", name: "DeepSeek R1", cost: "$0.55/1M" },
    { id: "x-ai/grok-2-1212", name: "Grok-2", cost: "$2.00/1M" },
    { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", cost: "$0.10/1M" },
    { id: "google/gemini-2.5-pro-preview-03-25", name: "Gemini 2.5 Pro", cost: "$1.25/1M" },
  ]
};

interface SettingsTabProps {
  providers: ProviderConfig[];
  onProvidersChange: (providers: ProviderConfig[]) => void;
  consensusMode: ConsensusMode;
  onConsensusModeChange: (mode: ConsensusMode) => void;
}

const CONSENSUS_MODES: { id: ConsensusMode; name: string; description: string }[] = [
  { id: "auto", name: "Auto", description: "Automatically select based on task type" },
  { id: "exact", name: "Exact Match", description: "Group identical answers, best for structured tasks" },
  { id: "semantic", name: "Semantic", description: "Cluster similar answers, best for open-ended tasks" },
];

export default function SettingsTab({ providers, onProvidersChange, consensusMode, onConsensusModeChange }: SettingsTabProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newProvider, setNewProvider] = useState({
    name: "",
    baseUrl: "",
    apiKey: "",
    model: ""
  });

  const handleToggleProvider = (id: string, checked: boolean) => {
    const updated = providers.map(p => 
      p.id === id ? { ...p, enabled: checked } : p
    );
    onProvidersChange(updated);
    
    if (checked) {
      toast({
        title: "Provider Enabled",
        description: `${providers.find(p => p.id === id)?.name} added to reasoning pool.`,
      });
    }
  };

  const handleModelChange = (providerId: string, modelId: string) => {
    const updated = providers.map(p => 
      p.id === providerId ? { ...p, model: modelId } : p
    );
    onProvidersChange(updated);
  };

  const handleAddProvider = () => {
    if (!newProvider.name || !newProvider.baseUrl || !newProvider.model) {
      toast({
        title: "Missing Fields",
        description: "Please fill in provider name, API URL, and model name.",
        variant: "destructive"
      });
      return;
    }

    const id = `custom-${Date.now()}`;
    const customProvider: ProviderConfig = {
      id,
      name: newProvider.name,
      enabled: true,
      model: newProvider.model,
      isCustom: true,
      baseUrl: newProvider.baseUrl,
      apiKey: newProvider.apiKey
    };

    onProvidersChange([...providers, customProvider]);
    setNewProvider({ name: "", baseUrl: "", apiKey: "", model: "" });
    setIsAddDialogOpen(false);
    
    toast({
      title: "Provider Added",
      description: `${newProvider.name} has been added to your providers.`,
    });
  };

  const handleDeleteProvider = (id: string) => {
    const provider = providers.find(p => p.id === id);
    if (provider?.isCustom) {
      onProvidersChange(providers.filter(p => p.id !== id));
      toast({
        title: "Provider Removed",
        description: `${provider.name} has been removed.`,
      });
    }
  };

  const handleSave = async () => {
    try {
      await updateSettings(providers, consensusMode);
      const activeProviders = providers.filter(p => p.enabled);
      const modeLabel = CONSENSUS_MODES.find(m => m.id === consensusMode)?.name || consensusMode;
      toast({
        title: "Configuration Saved",
        description: `Poetiq configured with ${activeProviders.length} model${activeProviders.length !== 1 ? 's' : ''} using ${modeLabel} consensus.`,
      });
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast({
        title: "Error",
        description: "Failed to save configuration. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
          <Settings2 className="w-6 h-6 text-indigo-600" />
          Multi-Model Configuration
        </h2>
        <p className="text-neutral-500">
          Poetiq uses Replit AI Integrations to orchestrate multiple LLMs simultaneously. Enable the providers you want to include in the reasoning mix. Charges are billed to your Replit credits.
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
              <div 
                key={provider.id} 
                className="flex items-start justify-between p-4 rounded-lg border border-neutral-100 bg-neutral-50/30 hover:bg-neutral-50 transition-colors"
                data-testid={`provider-config-${provider.id}`}
              >
                <div className="flex flex-col gap-3 flex-1 mr-6">
                  <div className="flex items-center gap-3">
                    <Switch 
                      id={`toggle-${provider.id}`}
                      checked={provider.enabled}
                      onCheckedChange={(checked) => handleToggleProvider(provider.id, checked)}
                      data-testid={`switch-provider-${provider.id}`}
                    />
                    <Label htmlFor={`toggle-${provider.id}`} className="text-base font-semibold text-neutral-900 cursor-pointer">
                      {provider.name}
                    </Label>
                    {provider.enabled && (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                        Active
                      </Badge>
                    )}
                    {provider.isCustom && (
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px]">
                        Custom
                      </Badge>
                    )}
                  </div>
                  
                  <div className="pl-14">
                    <div className="flex items-center gap-4">
                      <Label className="text-xs text-neutral-500 uppercase font-medium min-w-[60px]">Model</Label>
                      {provider.isCustom ? (
                        <Input
                          value={provider.model}
                          onChange={(e) => handleModelChange(provider.id, e.target.value)}
                          disabled={!provider.enabled}
                          className="w-[280px] h-9 bg-white text-sm"
                          placeholder="Model name (e.g., gpt-4)"
                          data-testid={`input-model-${provider.id}`}
                        />
                      ) : (
                        <Select 
                          value={provider.model} 
                          onValueChange={(val) => handleModelChange(provider.id, val)}
                          disabled={!provider.enabled}
                        >
                          <SelectTrigger className="w-[280px] h-9 bg-white text-sm" data-testid={`select-model-${provider.id}`}>
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-neutral-200 shadow-lg">
                            {(PROVIDER_MODELS[provider.id] || []).map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                <div className="flex items-center justify-between w-full gap-4">
                                  <span>{m.name}</span>
                                  <span className="text-xs text-neutral-400 font-mono">{m.cost}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {provider.isCustom && provider.baseUrl && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-neutral-400">
                        <Link className="w-3 h-3" />
                        <span className="truncate max-w-[250px]">{provider.baseUrl}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="hidden sm:flex flex-col items-end gap-2 text-xs text-neutral-400 font-mono pt-1">
                  {provider.isCustom ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteProvider(provider.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                      data-testid={`button-delete-${provider.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-neutral-300" />
                      Replit AI
                    </div>
                  )}
                </div>
              </div>
            ))}

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full border-dashed border-2 border-neutral-300 hover:border-indigo-400 hover:bg-indigo-50/50 text-neutral-600 hover:text-indigo-600"
                  data-testid="button-add-provider"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Custom Provider
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add Custom Provider</DialogTitle>
                  <DialogDescription>
                    Connect any OpenAI-compatible API endpoint as a custom provider.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="provider-name">Provider Name</Label>
                    <Input
                      id="provider-name"
                      placeholder="My Custom LLM"
                      value={newProvider.name}
                      onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                      data-testid="input-new-provider-name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="provider-url">API Base URL</Label>
                    <Input
                      id="provider-url"
                      placeholder="https://api.example.com/v1"
                      value={newProvider.baseUrl}
                      onChange={(e) => setNewProvider({ ...newProvider, baseUrl: e.target.value })}
                      data-testid="input-new-provider-url"
                    />
                    <p className="text-xs text-neutral-500">The base URL for the OpenAI-compatible API</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="provider-key">API Key (optional)</Label>
                    <Input
                      id="provider-key"
                      type="password"
                      placeholder="sk-..."
                      value={newProvider.apiKey}
                      onChange={(e) => setNewProvider({ ...newProvider, apiKey: e.target.value })}
                      data-testid="input-new-provider-key"
                    />
                    <p className="text-xs text-neutral-500">Leave empty if not required</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="provider-model">Model Name</Label>
                    <Input
                      id="provider-model"
                      placeholder="gpt-4, llama-3, etc."
                      value={newProvider.model}
                      onChange={(e) => setNewProvider({ ...newProvider, model: e.target.value })}
                      data-testid="input-new-provider-model"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddProvider} data-testid="button-confirm-add-provider">
                    Add Provider
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            <div className="rounded-md bg-blue-50 p-4 border border-blue-100 flex gap-3">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-semibold mb-1">Poetiq Optimization Strategy</p>
                <p className="leading-relaxed opacity-90">
                  The system will automatically route sub-tasks to the enabled models based on their strengths (e.g., using Claude for code generation and GPT-5 for logical critique). 
                  Disabling a provider removes it from the potential reasoning paths.
                </p>
              </div>
            </div>

          </CardContent>
        </Card>

        <Card className="border-neutral-200 bg-white shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-neutral-500" />
              Consensus Strategy
            </CardTitle>
            <CardDescription>
              When multiple models are enabled, choose how their answers are combined. This affects how Poetiq determines the best response.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Label className="text-xs text-neutral-500 uppercase font-medium min-w-[80px]">Strategy</Label>
              <Select 
                value={consensusMode} 
                onValueChange={(val) => onConsensusModeChange(val as ConsensusMode)}
              >
                <SelectTrigger className="w-[280px] h-9 bg-white text-sm" data-testid="select-consensus-mode">
                  <SelectValue placeholder="Select consensus mode" />
                </SelectTrigger>
                <SelectContent className="bg-white border-neutral-200 shadow-lg">
                  {CONSENSUS_MODES.map((mode) => (
                    <SelectItem key={mode.id} value={mode.id}>
                      <div className="flex flex-col">
                        <span>{mode.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="text-sm text-neutral-500 pl-[96px]">
              {CONSENSUS_MODES.find(m => m.id === consensusMode)?.description}
            </div>

            <div className="rounded-md bg-amber-50 p-4 border border-amber-100 flex gap-3 mt-4">
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold mb-1">When to use each strategy</p>
                <ul className="leading-relaxed opacity-90 list-disc list-inside space-y-1">
                  <li><strong>Auto:</strong> Let Poetiq analyze your prompt and choose automatically</li>
                  <li><strong>Exact Match:</strong> Best for math, code, factual questions with one correct answer</li>
                  <li><strong>Semantic:</strong> Best for explanations, creative tasks, open-ended discussions</li>
                </ul>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-neutral-50/50 border-t border-neutral-100 flex justify-end items-center py-4">
             <Button 
               onClick={handleSave} 
               className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200"
               data-testid="button-save-settings"
             >
               Save System Configuration
             </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
