import { callOpenAI, callAnthropic, streamOpenAI, streamAnthropic, type ProviderConfig, type ReasoningStep } from "./providers";

export class PoetiqOrchestrator {
  private providers: ProviderConfig[];

  constructor(providers: ProviderConfig[]) {
    this.providers = providers.filter(p => p.enabled);
  }

  async* solveTask(
    userPrompt: string,
    onReasoningStep?: (step: ReasoningStep) => void
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
      
      onReasoningStep?.({
        provider: provider.id,
        model: provider.model,
        action: "generate",
        content: `Using ${provider.name} (${provider.model}) for single-model reasoning`,
      });

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ];

      if (provider.id === "openai") {
        for await (const chunk of streamOpenAI(provider.model, messages)) {
          yield chunk;
        }
      } else if (provider.id === "anthropic") {
        for await (const chunk of streamAnthropic(provider.model, messages)) {
          yield chunk;
        }
      }
    } else {
      onReasoningStep?.({
        provider: "orchestrator",
        model: "multi-model",
        action: "analyze",
        content: `Orchestrating ${enabledProviders.length} models: ${enabledProviders.map(p => p.name).join(", ")}`,
      });

      const primaryProvider = enabledProviders[0];
      const secondaryProvider = enabledProviders[1];

      onReasoningStep?.({
        provider: primaryProvider.id,
        model: primaryProvider.model,
        action: "generate",
        content: `Generating initial solution with ${primaryProvider.name}`,
      });

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ];

      let initialResponse = "";
      if (primaryProvider.id === "openai") {
        initialResponse = await callOpenAI(primaryProvider.model, messages);
      } else if (primaryProvider.id === "anthropic") {
        initialResponse = await callAnthropic(primaryProvider.model, messages);
      }

      onReasoningStep?.({
        provider: secondaryProvider.id,
        model: secondaryProvider.model,
        action: "refine",
        content: `Refining and critiquing with ${secondaryProvider.name}`,
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

      if (secondaryProvider.id === "openai") {
        for await (const chunk of streamOpenAI(secondaryProvider.model, refineMessages)) {
          yield chunk;
        }
      } else if (secondaryProvider.id === "anthropic") {
        for await (const chunk of streamAnthropic(secondaryProvider.model, refineMessages)) {
          yield chunk;
        }
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
        title = await callOpenAI(provider.model, messages);
      } else if (provider.id === "anthropic") {
        title = await callAnthropic(provider.model, messages);
      }
      return title.trim().replace(/^["']|["']$/g, "").slice(0, 60);
    } catch (error) {
      console.error("Error generating title:", error);
      return "New Conversation";
    }
  }
}
