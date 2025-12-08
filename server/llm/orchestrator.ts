import { callOpenAI, callAnthropic, streamOpenAI, streamAnthropic, type ProviderConfig, type ReasoningStep, type TokenUsage } from "./providers";

export class PoetiqOrchestrator {
  private providers: ProviderConfig[];

  constructor(providers: ProviderConfig[]) {
    this.providers = providers.filter(p => p.enabled);
  }

  async* solveTask(
    userPrompt: string,
    onReasoningStep?: (step: ReasoningStep) => void,
    onTokenUsage?: (usage: TokenUsage) => void
  ): AsyncGenerator<string> {
    const enabledProviders = this.providers.filter(p => p.enabled);
    
    if (enabledProviders.length === 0) {
      yield "Error: No LLM providers enabled. Please enable at least one provider in settings.";
      return;
    }

    const systemPrompt = `You are Poetiq, an advanced reasoning system that solves complex problems through iterative refinement.

Your approach:
1. Break down the problem into sub-components
2. Analyze each component systematically
3. Build solutions incrementally
4. Verify and refine your reasoning
5. Synthesize a comprehensive answer

Focus on clarity, logical progression, and actionable insights.`;

    if (enabledProviders.length === 1) {
      const provider = enabledProviders[0];
      
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ];

      let stepUsage: { inputTokens: number; outputTokens: number } = { inputTokens: 0, outputTokens: 0 };
      const handleUsage = (usage: { inputTokens: number; outputTokens: number }) => {
        stepUsage = usage;
        onTokenUsage?.(usage);
      };

      if (provider.id === "openai") {
        for await (const chunk of streamOpenAI(provider.model, messages, handleUsage)) {
          yield chunk;
        }
      } else if (provider.id === "anthropic") {
        for await (const chunk of streamAnthropic(provider.model, messages, handleUsage)) {
          yield chunk;
        }
      }

      onReasoningStep?.({
        provider: provider.id,
        model: provider.model,
        action: "generate",
        content: `Generated response with ${provider.name} (${provider.model})`,
        tokenUsage: stepUsage,
      });
    } else {
      onReasoningStep?.({
        provider: "orchestrator",
        model: "multi-model",
        action: "analyze",
        content: `Orchestrating ${enabledProviders.length} models: ${enabledProviders.map(p => p.name).join(", ")}`,
      });

      const primaryProvider = enabledProviders[0];
      const secondaryProvider = enabledProviders[1];

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ];

      let initialResponse = "";
      let primaryUsage = { inputTokens: 0, outputTokens: 0 };
      let accumulatedUsage = { inputTokens: 0, outputTokens: 0 };
      
      if (primaryProvider.id === "openai") {
        const result = await callOpenAI(primaryProvider.model, messages);
        initialResponse = result.content;
        primaryUsage = result.usage;
        accumulatedUsage.inputTokens += result.usage.inputTokens;
        accumulatedUsage.outputTokens += result.usage.outputTokens;
      } else if (primaryProvider.id === "anthropic") {
        const result = await callAnthropic(primaryProvider.model, messages);
        initialResponse = result.content;
        primaryUsage = result.usage;
        accumulatedUsage.inputTokens += result.usage.inputTokens;
        accumulatedUsage.outputTokens += result.usage.outputTokens;
      }

      onReasoningStep?.({
        provider: primaryProvider.id,
        model: primaryProvider.model,
        action: "generate",
        content: `Generated initial solution with ${primaryProvider.name}`,
        tokenUsage: primaryUsage,
      });

      const refineMessages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
        { role: "assistant", content: initialResponse },
        { 
          role: "user", 
          content: "Please review the above response. Identify any gaps, errors, or areas for improvement, then provide an enhanced, more comprehensive answer."
        }
      ];

      let secondaryUsage = { inputTokens: 0, outputTokens: 0 };
      const handleFinalUsage = (streamUsage: { inputTokens: number; outputTokens: number }) => {
        secondaryUsage = streamUsage;
        const totalUsage = {
          inputTokens: accumulatedUsage.inputTokens + streamUsage.inputTokens,
          outputTokens: accumulatedUsage.outputTokens + streamUsage.outputTokens,
        };
        onTokenUsage?.(totalUsage);
      };

      if (secondaryProvider.id === "openai") {
        for await (const chunk of streamOpenAI(secondaryProvider.model, refineMessages, handleFinalUsage)) {
          yield chunk;
        }
      } else if (secondaryProvider.id === "anthropic") {
        for await (const chunk of streamAnthropic(secondaryProvider.model, refineMessages, handleFinalUsage)) {
          yield chunk;
        }
      }

      onReasoningStep?.({
        provider: secondaryProvider.id,
        model: secondaryProvider.model,
        action: "refine",
        content: `Refined and enhanced with ${secondaryProvider.name}`,
        tokenUsage: secondaryUsage,
      });
    }
  }

  async* chat(
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>
  ): AsyncGenerator<string> {
    const enabledProviders = this.providers.filter(p => p.enabled);
    
    if (enabledProviders.length === 0) {
      yield "Error: No LLM providers enabled. Please enable at least one provider in settings.";
      return;
    }

    const provider = enabledProviders[0];
    
    const systemMessage = {
      role: "system" as const,
      content: "You are a helpful AI assistant. Provide clear, thoughtful responses."
    };
    
    const fullMessages = [systemMessage, ...messages];

    if (provider.id === "openai") {
      for await (const chunk of streamOpenAI(provider.model, fullMessages)) {
        yield chunk;
      }
    } else if (provider.id === "anthropic") {
      for await (const chunk of streamAnthropic(provider.model, fullMessages)) {
        yield chunk;
      }
    }
  }

  async generateTitle(firstMessage: string): Promise<string> {
    const provider = this.providers[0];
    if (!provider) return "New Conversation";

    const messages = [
      { 
        role: "system", 
        content: "Generate a concise 3-5 word title for this conversation. Return only the title, no quotes or extra text." 
      },
      { role: "user", content: firstMessage }
    ];

    try {
      let title = "";
      if (provider.id === "openai") {
        const result = await callOpenAI(provider.model, messages);
        title = result.content;
      } else if (provider.id === "anthropic") {
        const result = await callAnthropic(provider.model, messages);
        title = result.content;
      }
      return title.trim().replace(/^["']|["']$/g, "").slice(0, 60);
    } catch (error) {
      console.error("Error generating title:", error);
      return "New Conversation";
    }
  }

  async generateSummary(prompt: string): Promise<string> {
    const provider = this.providers[0];
    if (!provider) return "";

    const messages = [
      { 
        role: "system", 
        content: "You are a helpful assistant that creates concise conversation summaries." 
      },
      { role: "user", content: prompt }
    ];

    try {
      let summary = "";
      if (provider.id === "openai") {
        const result = await callOpenAI(provider.model, messages);
        summary = result.content;
      } else if (provider.id === "anthropic") {
        const result = await callAnthropic(provider.model, messages);
        summary = result.content;
      }
      return summary.trim();
    } catch (error) {
      console.error("Error generating summary:", error);
      return "";
    }
  }
}
