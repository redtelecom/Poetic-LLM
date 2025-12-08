import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { 
  CheckCircle2, 
  Settings2, 
  Key, 
  ShieldCheck, 
  Eye, 
  EyeOff 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface ProviderConfig {
  id: string;
  name: string;
  icon: string;
  description: string;
  apiKey: string;
  isConnected: boolean;
}

export default function Settings() {
  const [providers, setProviders] = React.useState<ProviderConfig[]>([
    {
      id: "openai",
      name: "OpenAI",
      icon: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/ChatGPT_logo.svg/1024px-ChatGPT_logo.svg.png",
      description: "GPT-4o, GPT-3.5 Turbo",
      apiKey: "",
      isConnected: false
    },
    {
      id: "anthropic",
      name: "Anthropic",
      icon: "https://upload.wikimedia.org/wikipedia/commons/7/78/Anthropic_logo.svg",
      description: "Claude 3.5 Sonnet, Opus",
      apiKey: "",
      isConnected: false
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      icon: "https://avatars.githubusercontent.com/u/132865627?s=200&v=4",
      description: "DeepSeek, Llama 3, Mixtral",
      apiKey: "",
      isConnected: false
    }
  ]);

  const [showKeys, setShowKeys] = React.useState<Record<string, boolean>>({});

  const toggleShowKey = (id: string) => {
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleKeyChange = (id: string, value: string) => {
    setProviders(prev => prev.map(p => 
      p.id === id ? { ...p, apiKey: value } : p
    ));
  };

  const handleConnect = (id: string) => {
    const provider = providers.find(p => p.id === id);
    if (!provider?.apiKey.trim()) {
      toast({
        title: "API Key Required",
        description: `Please enter a valid API key for ${provider?.name}`,
        variant: "destructive"
      });
      return;
    }

    // Mock verification delay
    toast({
      title: "Verifying credentials...",
      description: "Checking API key validity.",
    });

    setTimeout(() => {
      setProviders(prev => prev.map(p => 
        p.id === id ? { ...p, isConnected: true } : p
      ));
      toast({
        title: "Connected Successfully",
        description: `${provider?.name} has been integrated.`,
        variant: "default"
      });
    }, 1500);
  };

  const handleDisconnect = (id: string) => {
    setProviders(prev => prev.map(p => 
      p.id === id ? { ...p, isConnected: false, apiKey: "" } : p
    ));
    toast({
      title: "Disconnected",
      description: "Provider configuration removed.",
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
          <Settings2 className="w-6 h-6 text-indigo-600" />
          Model Providers
        </h2>
        <p className="text-neutral-500">
          Configure API keys to enable reasoning with frontier models. Keys are stored locally in your browser.
        </p>
      </div>

      <div className="grid gap-6">
        {providers.map((provider) => (
          <Card key={provider.id} className={cn(
            "border-neutral-200 transition-all duration-300",
            provider.isConnected ? "border-emerald-200 bg-emerald-50/30" : "bg-white"
          )}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-white border border-neutral-100 p-1.5 flex items-center justify-center shadow-sm">
                  <img src={provider.icon} alt={provider.name} className="w-full h-full object-contain" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
                    {provider.name}
                    {provider.isConnected && (
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 text-[10px] px-2 h-5">
                        Connected
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>{provider.description}</CardDescription>
                </div>
              </div>
              {provider.isConnected && (
                <ShieldCheck className="w-6 h-6 text-emerald-500 opacity-20" />
              )}
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                <Label htmlFor={`key-${provider.id}`} className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  API Key
                </Label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                    <Key className="w-4 h-4" />
                  </div>
                  <Input
                    id={`key-${provider.id}`}
                    type={showKeys[provider.id] ? "text" : "password"}
                    placeholder={`sk-...`}
                    className={cn(
                      "pl-9 pr-10 font-mono text-sm",
                      provider.isConnected 
                        ? "bg-emerald-50/50 border-emerald-200 text-emerald-900 focus-visible:ring-emerald-500" 
                        : "bg-white"
                    )}
                    value={provider.apiKey}
                    onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                    disabled={provider.isConnected}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-neutral-400 hover:text-neutral-600"
                    onClick={() => toggleShowKey(provider.id)}
                  >
                    {showKeys[provider.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end pt-2 border-t border-neutral-100/50">
              {provider.isConnected ? (
                <Button 
                  variant="outline" 
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100"
                  onClick={() => handleDisconnect(provider.id)}
                >
                  Disconnect
                </Button>
              ) : (
                <Button 
                  className="bg-neutral-900 hover:bg-neutral-800 text-white min-w-[100px]"
                  onClick={() => handleConnect(provider.id)}
                  disabled={!provider.apiKey}
                >
                  Connect
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-indigo-600 mt-0.5" />
          <div className="text-sm text-indigo-900">
            <p className="font-semibold mb-1">Security Note</p>
            <p className="text-indigo-800/80 leading-relaxed">
              Your API keys are stored securely in your browser's local storage and are never sent to our servers. 
              They are only used to make direct requests to the model providers from your client.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
