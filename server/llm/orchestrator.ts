import { callOpenAI, callAnthropic, streamOpenAI, streamAnthropic, type ProviderConfig, type ReasoningStep, type TokenUsage, type MessageContent } from "./providers";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ExpertRunner } from "./expertRunner";
import { TaskRouter } from "./taskRouter";
import { ExactMatchAggregator, SemanticAggregator, canonicalizeAnswer, extractFinalAnswer } from "./consensus";
import type { ExpertConfig, ExpertResult, ConsensusResult, ConsensusMode, TaskType, QuantPipelineResult } from "./types";

export class PoetiqOrchestrator {
  private providers: ProviderConfig[];
  private taskRouter: TaskRouter;
  private exactAggregator: ExactMatchAggregator;
  private semanticAggregator: SemanticAggregator;
  private consensusMode: ConsensusMode = "auto";

  constructor(providers: ProviderConfig[], consensusMode: ConsensusMode = "auto") {
    this.providers = providers.filter(p => p.enabled);
    this.taskRouter = new TaskRouter();
    this.exactAggregator = new ExactMatchAggregator();
    this.semanticAggregator = new SemanticAggregator();
    this.consensusMode = consensusMode;
  }

  private async executePython(code: string): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `poetiq_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
      let resolved = false;
      let timeoutId: NodeJS.Timeout | null = null;
      
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
        }
      };

      const safeResolve = (result: { success: boolean; output: string }) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(result);
        }
      };
      
      try {
        fs.writeFileSync(tempFile, code, "utf-8");
        
        const pythonProcess = spawn("python3", [tempFile], {
          cwd: tempDir,
        });

        let stdout = "";
        let stderr = "";

        pythonProcess.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        pythonProcess.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        pythonProcess.on("close", (exitCode) => {
          if (exitCode === 0) {
            const output = stdout.trim() + (stderr.trim() ? `\n[stderr]: ${stderr.trim()}` : "");
            safeResolve({ success: true, output: output || "Code executed successfully (no output)" });
          } else {
            safeResolve({ success: false, output: stderr.trim() || `Process exited with code ${exitCode}` });
          }
        });

        pythonProcess.on("error", (err) => {
          safeResolve({ success: false, output: `Failed to execute Python: ${err.message}` });
        });

        timeoutId = setTimeout(() => {
          pythonProcess.kill();
          safeResolve({ success: false, output: "Execution timed out (10 second limit)" });
        }, 10000);
      } catch (err: any) {
        safeResolve({ success: false, output: `Error: ${err.message}` });
      }
    });
  }

  private extractPythonCode(response: string): string | null {
    const codeBlockMatch = response.match(/```python\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }
    const altMatch = response.match(/```\n([\s\S]*?)```/);
    if (altMatch) {
      return altMatch[1].trim();
    }
    return null;
  }

  private async collectStreamedResponse(
    provider: ProviderConfig,
    messages: MessageContent[]
  ): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }> {
    let content = "";
    let usage = { inputTokens: 0, outputTokens: 0 };

    const handleUsage = (u: { inputTokens: number; outputTokens: number }) => {
      usage = u;
    };

    if (provider.id === "openai") {
      for await (const chunk of streamOpenAI(provider.model, messages, handleUsage)) {
        content += chunk;
      }
    } else if (provider.id === "anthropic") {
      for await (const chunk of streamAnthropic(provider.model, messages, handleUsage)) {
        content += chunk;
      }
    }

    return { content, usage };
  }

  private async* yieldBufferedContent(content: string): AsyncGenerator<string> {
    const chunkSize = 20;
    for (let i = 0; i < content.length; i += chunkSize) {
      yield content.slice(i, i + chunkSize);
    }
  }

  private isQuantTask(userPrompt: string | MessageContent[]): boolean {
    const keywords = ["tradingview", "pine script", "pinescript", "strategy", "backtest", "indicator"];
    let textToCheck = "";
    
    if (typeof userPrompt === "string") {
      textToCheck = userPrompt.toLowerCase();
    } else {
      textToCheck = userPrompt
        .filter(m => m.role === "user")
        .map(m => {
          if (typeof m.content === "string") {
            return m.content;
          }
          return JSON.stringify(m.content);
        })
        .join(" ")
        .toLowerCase();
    }
    
    return keywords.some(keyword => textToCheck.includes(keyword));
  }

  private extractUserPromptText(userPrompt: string | MessageContent[]): string {
    if (typeof userPrompt === "string") {
      return userPrompt;
    }
    return userPrompt
      .filter(m => m.role === "user")
      .map(m => {
        if (typeof m.content === "string") {
          return m.content;
        }
        return JSON.stringify(m.content);
      })
      .join("\n");
  }

  private getQuantAnalystPrompt(): string {
    return `You are a Senior Quant Analyst specializing in algorithmic trading strategies. 

Your task is to analyze the user's trading strategy request. Do NOT write any code yet.

Instead, output a structured "Strategy Plan" that includes:

## Strategy Plan

### 1. Entry Conditions
- Define precise conditions for entering long/short positions
- Specify the indicators or price action patterns to use

### 2. Exit Conditions  
- Define conditions for closing positions (take profit, stop loss triggers)
- Specify trailing stop logic if applicable

### 3. Risk Management
- Stop Loss (SL): Define the stop loss method and level
- Take Profit (TP): Define the take profit method and level
- Position sizing considerations

### 4. Potential Pitfalls
- Identify repainting risks (using future data)
- Lookahead bias concerns
- Overfitting risks
- Market condition dependencies

Be thorough and specific. This plan will be used to implement the Pine Script code.`;
  }

  private getQuantCoderPrompt(): string {
    return `You are a Lead Pine Script Developer for TradingView. 

Implement the following strategy in strict Pine Script V6.

Requirements:
1. Use //@version=6 at the top
2. Use strategy() function for strategy scripts or indicator() for indicators
3. Use strategy.entry() and strategy.exit() for trade management
4. Include proper guard clauses (e.g., barstate.isconfirmed to avoid repainting)
5. Add robust error handling and input validation
6. Comment EVERY logic block explaining what it does
7. Use meaningful variable names
8. Include user-configurable inputs with sensible defaults

Output ONLY the Pine Script code wrapped in a \`\`\`pine code block.`;
  }

  private validatePineScript(pineScriptCode: string): {
    hasPineCodeBlock: boolean;
    hasVersionDirective: boolean;
    hasStrategyEntry: boolean;
    hasStrategyExit: boolean;
    isIndicator: boolean;
    score: number;
  } {
    const hasPineCodeBlock = pineScriptCode.includes("```pine") || pineScriptCode.includes("```pinescript");
    const hasVersionDirective = pineScriptCode.includes("//@version=6");
    const isIndicator = pineScriptCode.includes("indicator(");
    const hasStrategyEntry = pineScriptCode.includes("strategy.entry");
    const hasStrategyExit = pineScriptCode.includes("strategy.exit");
    
    let score = 0;
    if (hasPineCodeBlock) score += 2;
    if (hasVersionDirective) score += 2;
    if (isIndicator || (hasStrategyEntry && hasStrategyExit)) score += 3;
    if (hasStrategyEntry) score += 1;
    if (hasStrategyExit) score += 1;
    if (pineScriptCode.includes("input.")) score += 1;

    return { hasPineCodeBlock, hasVersionDirective, hasStrategyEntry, hasStrategyExit, isIndicator, score };
  }

  private async runQuantPipelineForProvider(
    provider: ProviderConfig,
    userText: string,
    onReasoningStep?: (step: ReasoningStep) => void
  ): Promise<QuantPipelineResult> {
    let accumulatedUsage = { inputTokens: 0, outputTokens: 0 };

    try {
      onReasoningStep?.({
        provider: provider.id,
        model: provider.model,
        action: "think",
        content: `[${provider.name}] Step 1: Analyst generating Strategy Plan...`,
      });

      const analystMessages: MessageContent[] = [
        { role: "system", content: this.getQuantAnalystPrompt() },
        { role: "user", content: userText }
      ];

      const { content: strategyPlan, usage: analystUsage } = await this.collectStreamedResponse(provider, analystMessages);
      accumulatedUsage.inputTokens += analystUsage.inputTokens;
      accumulatedUsage.outputTokens += analystUsage.outputTokens;

      onReasoningStep?.({
        provider: provider.id,
        model: provider.model,
        action: "verify",
        content: `[${provider.name}] Strategy Plan completed. Proceeding to code generation...`,
        tokenUsage: { inputTokens: analystUsage.inputTokens, outputTokens: analystUsage.outputTokens },
      });

      onReasoningStep?.({
        provider: provider.id,
        model: provider.model,
        action: "code",
        content: `[${provider.name}] Step 2: Coder generating Pine Script V6...`,
      });

      const coderMessages: MessageContent[] = [
        { role: "system", content: this.getQuantCoderPrompt() },
        { role: "user", content: `Original Request: ${userText}\n\nStrategy Plan:\n${strategyPlan}` }
      ];

      const { content: pineScriptCode, usage: coderUsage } = await this.collectStreamedResponse(provider, coderMessages);
      accumulatedUsage.inputTokens += coderUsage.inputTokens;
      accumulatedUsage.outputTokens += coderUsage.outputTokens;

      const validation = this.validatePineScript(pineScriptCode);

      onReasoningStep?.({
        provider: provider.id,
        model: provider.model,
        action: "verify",
        content: `[${provider.name}] Pine Script generated. Score: ${validation.score}/10. V6: ${validation.hasVersionDirective ? "✓" : "✗"}, Strategy functions: ${validation.isIndicator || (validation.hasStrategyEntry && validation.hasStrategyExit) ? "✓" : "✗"}`,
        tokenUsage: { inputTokens: coderUsage.inputTokens, outputTokens: coderUsage.outputTokens },
      });

      return {
        providerId: provider.id,
        providerName: provider.name,
        model: provider.model,
        strategyPlan,
        pineScriptCode,
        success: true,
        usage: accumulatedUsage,
        validation,
      };
    } catch (error: any) {
      onReasoningStep?.({
        provider: provider.id,
        model: provider.model,
        action: "error",
        content: `[${provider.name}] Pipeline failed: ${error.message}`,
      });

      return {
        providerId: provider.id,
        providerName: provider.name,
        model: provider.model,
        strategyPlan: "",
        pineScriptCode: "",
        success: false,
        usage: accumulatedUsage,
        validation: { hasPineCodeBlock: false, hasVersionDirective: false, hasStrategyEntry: false, hasStrategyExit: false, isIndicator: false, score: 0 },
        error: error.message,
      };
    }
  }

  private selectBestQuantResult(results: QuantPipelineResult[]): QuantPipelineResult {
    const successfulResults = results.filter(r => r.success);
    if (successfulResults.length === 0) {
      return results[0];
    }
    if (successfulResults.length === 1) {
      return successfulResults[0];
    }
    return successfulResults.sort((a, b) => b.validation.score - a.validation.score)[0];
  }

  async* solveQuantTask(
    userPrompt: string | MessageContent[],
    onReasoningStep?: (step: ReasoningStep) => void,
    onTokenUsage?: (usage: TokenUsage) => void
  ): AsyncGenerator<string> {
    const enabledProviders = this.providers.filter(p => p.enabled);
    
    if (enabledProviders.length === 0) {
      yield "Error: No LLM providers enabled. Please enable at least one provider in settings.";
      return;
    }

    const userText = this.extractUserPromptText(userPrompt);

    if (enabledProviders.length === 1) {
      yield* this.solveQuantTaskSingleProvider(enabledProviders[0], userText, onReasoningStep, onTokenUsage);
      return;
    }

    onReasoningStep?.({
      provider: "orchestrator",
      model: "quant-solver",
      action: "analyze",
      content: `Starting Multi-Model Quant Solver with ${enabledProviders.length} providers in parallel`,
    });

    yield `*Running Quant Solver pipeline across ${enabledProviders.length} AI models in parallel...*\n\n`;

    for (const provider of enabledProviders) {
      onReasoningStep?.({
        provider: provider.id,
        model: provider.model,
        action: "think",
        content: `[${provider.name}] Starting Quant pipeline...`,
      });
    }

    const pipelinePromises = enabledProviders.map(provider => 
      this.runQuantPipelineForProvider(provider, userText, onReasoningStep)
    );

    const results: QuantPipelineResult[] = await Promise.all(pipelinePromises);

    let totalUsage = { inputTokens: 0, outputTokens: 0 };
    for (const result of results) {
      totalUsage.inputTokens += result.usage.inputTokens;
      totalUsage.outputTokens += result.usage.outputTokens;
    }
    onTokenUsage?.(totalUsage);

    const successfulResults = results.filter(r => r.success);

    if (successfulResults.length === 0) {
      onReasoningStep?.({
        provider: "orchestrator",
        model: "quant-solver",
        action: "fail",
        content: "All providers failed to generate Pine Script.",
      });
      yield "All AI models failed to generate Pine Script code. Please try again or rephrase your request.";
      return;
    }

    onReasoningStep?.({
      provider: "orchestrator",
      model: "consensus-engine",
      action: "think",
      content: `Evaluating ${successfulResults.length} Pine Script outputs for quality...`,
    });

    const bestResult = this.selectBestQuantResult(results);
    const agreementCount = successfulResults.filter(r => r.validation.score === bestResult.validation.score).length;
    const agreementPercent = Math.round((agreementCount / successfulResults.length) * 100);

    onReasoningStep?.({
      provider: "orchestrator",
      model: "consensus-engine",
      action: "complete",
      content: `Best result from ${bestResult.providerName} (score: ${bestResult.validation.score}/10, ${agreementPercent}% quality agreement)`,
    });

    if (successfulResults.length > 1) {
      const scoreComparison = successfulResults.map(r => `${r.providerName}: ${r.validation.score}/10`).join(", ");
      yield `**Multi-Model Consensus:** Selected ${bestResult.providerName} output (${scoreComparison})\n\n---\n\n`;
    }

    yield "## Strategy Analysis\n\n";
    for await (const chunk of this.yieldBufferedContent(bestResult.strategyPlan)) {
      yield chunk;
    }

    yield "\n\n---\n\n## Pine Script V6 Implementation\n\n";
    for await (const chunk of this.yieldBufferedContent(bestResult.pineScriptCode)) {
      yield chunk;
    }

    const validation = bestResult.validation;
    const validationIssues: string[] = [];
    if (!validation.hasPineCodeBlock) validationIssues.push("Missing ```pine code block");
    if (!validation.hasVersionDirective) validationIssues.push("Missing //@version=6 directive");
    if (!validation.isIndicator && !validation.hasStrategyEntry) validationIssues.push("Missing strategy.entry()");
    if (!validation.isIndicator && !validation.hasStrategyExit) validationIssues.push("Missing strategy.exit()");

    if (validationIssues.length > 0) {
      yield `\n\n> **Validation Notes**: ${validationIssues.join(", ")}. Please verify and correct before using in TradingView.\n`;
    }

    onReasoningStep?.({
      provider: "orchestrator",
      model: "quant-solver",
      action: "think",
      content: "Step 3: Guide generating testing instructions...",
    });

    const guideContent = `

---

## How to Test & Iterate

1. **Copy to TradingView**: Open TradingView, go to Pine Editor, and paste the code above.

2. **Add to Chart**: Click "Add to Chart" to apply the strategy/indicator.

3. **Open Strategy Tester**: Click on the "Strategy Tester" tab at the bottom to see performance metrics.

4. **Key Metrics to Monitor**:
   - **Profit Factor**: Should be > 1.5 for a viable strategy
   - **Max Drawdown**: Target < 15% for conservative risk management
   - **Win Rate**: Compare with your risk/reward ratio
   - **Total Trades**: Ensure sufficient sample size (50+ trades minimum)

5. **Iterate & Improve**: If your Max Drawdown exceeds 15%, paste the Strategy Tester results here, and I will adjust the risk management parameters (stop loss, position sizing, or entry filters).

6. **Backtest Different Timeframes**: Test on multiple timeframes (1H, 4H, 1D) to validate robustness.

7. **Forward Test**: Paper trade for at least 2-4 weeks before live deployment.
`;

    for await (const chunk of this.yieldBufferedContent(guideContent)) {
      yield chunk;
    }

    onReasoningStep?.({
      provider: "orchestrator",
      model: "quant-solver",
      action: "complete",
      content: `Quant Solver completed. Best output from ${bestResult.providerName}.`,
      tokenUsage: totalUsage,
    });
  }

  private async* solveQuantTaskSingleProvider(
    provider: ProviderConfig,
    userText: string,
    onReasoningStep?: (step: ReasoningStep) => void,
    onTokenUsage?: (usage: TokenUsage) => void
  ): AsyncGenerator<string> {
    let accumulatedUsage = { inputTokens: 0, outputTokens: 0 };

    onReasoningStep?.({
      provider: "orchestrator",
      model: "quant-solver",
      action: "analyze",
      content: `Starting Quant Solver pipeline with ${provider.name}`,
    });

    onReasoningStep?.({
      provider: provider.id,
      model: provider.model,
      action: "think",
      content: "Step 1: Analyst generating Strategy Plan...",
    });

    yield "## Strategy Analysis\n\n";

    const analystMessages: MessageContent[] = [
      { role: "system", content: this.getQuantAnalystPrompt() },
      { role: "user", content: userText }
    ];

    let strategyPlan = "";
    let analystUsage = { inputTokens: 0, outputTokens: 0 };
    const handleAnalystUsage = (u: { inputTokens: number; outputTokens: number }) => {
      analystUsage = u;
    };

    if (provider.id === "openai") {
      for await (const chunk of streamOpenAI(provider.model, analystMessages, handleAnalystUsage)) {
        strategyPlan += chunk;
        yield chunk;
      }
    } else if (provider.id === "anthropic") {
      for await (const chunk of streamAnthropic(provider.model, analystMessages, handleAnalystUsage)) {
        strategyPlan += chunk;
        yield chunk;
      }
    }

    accumulatedUsage.inputTokens += analystUsage.inputTokens;
    accumulatedUsage.outputTokens += analystUsage.outputTokens;
    onTokenUsage?.(accumulatedUsage);

    onReasoningStep?.({
      provider: provider.id,
      model: provider.model,
      action: "verify",
      content: "Strategy Plan completed. Proceeding to code generation...",
      tokenUsage: { inputTokens: accumulatedUsage.inputTokens, outputTokens: accumulatedUsage.outputTokens },
    });

    yield "\n\n---\n\n";

    onReasoningStep?.({
      provider: provider.id,
      model: provider.model,
      action: "code",
      content: "Step 2: Coder generating Pine Script V6...",
    });

    yield "## Pine Script V6 Implementation\n\n";

    const coderMessages: MessageContent[] = [
      { role: "system", content: this.getQuantCoderPrompt() },
      { role: "user", content: `Original Request: ${userText}\n\nStrategy Plan:\n${strategyPlan}` }
    ];

    let pineScriptCode = "";
    let coderUsage = { inputTokens: 0, outputTokens: 0 };
    const handleCoderUsage = (u: { inputTokens: number; outputTokens: number }) => {
      coderUsage = u;
    };

    if (provider.id === "openai") {
      for await (const chunk of streamOpenAI(provider.model, coderMessages, handleCoderUsage)) {
        pineScriptCode += chunk;
        yield chunk;
      }
    } else if (provider.id === "anthropic") {
      for await (const chunk of streamAnthropic(provider.model, coderMessages, handleCoderUsage)) {
        pineScriptCode += chunk;
        yield chunk;
      }
    }

    accumulatedUsage.inputTokens += coderUsage.inputTokens;
    accumulatedUsage.outputTokens += coderUsage.outputTokens;
    onTokenUsage?.(accumulatedUsage);

    const validation = this.validatePineScript(pineScriptCode);

    const validationIssues: string[] = [];
    if (!validation.hasPineCodeBlock) validationIssues.push("Missing ```pine code block");
    if (!validation.hasVersionDirective) validationIssues.push("Missing //@version=6 directive");
    if (!validation.isIndicator && !validation.hasStrategyEntry) validationIssues.push("Missing strategy.entry()");
    if (!validation.isIndicator && !validation.hasStrategyExit) validationIssues.push("Missing strategy.exit()");

    if (validationIssues.length > 0) {
      yield `\n\n> **Validation Notes**: ${validationIssues.join(", ")}. Please verify and correct before using in TradingView.\n`;
    }

    onReasoningStep?.({
      provider: provider.id,
      model: provider.model,
      action: "verify",
      content: `Pine Script code generated. Validation: ${validation.hasPineCodeBlock ? "✓ Code block" : "✗ No code block"}, ${validation.hasVersionDirective ? "✓ V6 directive" : "✗ Missing V6"}, ${validation.isIndicator || (validation.hasStrategyEntry && validation.hasStrategyExit) ? "✓ Strategy/Indicator functions" : `✗ Missing functions`}`,
      tokenUsage: { inputTokens: coderUsage.inputTokens, outputTokens: coderUsage.outputTokens },
    });

    onReasoningStep?.({
      provider: "orchestrator",
      model: "quant-solver",
      action: "think",
      content: "Step 3: Guide generating testing instructions...",
    });

    const guideContent = `

---

## How to Test & Iterate

1. **Copy to TradingView**: Open TradingView, go to Pine Editor, and paste the code above.

2. **Add to Chart**: Click "Add to Chart" to apply the strategy/indicator.

3. **Open Strategy Tester**: Click on the "Strategy Tester" tab at the bottom to see performance metrics.

4. **Key Metrics to Monitor**:
   - **Profit Factor**: Should be > 1.5 for a viable strategy
   - **Max Drawdown**: Target < 15% for conservative risk management
   - **Win Rate**: Compare with your risk/reward ratio
   - **Total Trades**: Ensure sufficient sample size (50+ trades minimum)

5. **Iterate & Improve**: If your Max Drawdown exceeds 15%, paste the Strategy Tester results here, and I will adjust the risk management parameters (stop loss, position sizing, or entry filters).

6. **Backtest Different Timeframes**: Test on multiple timeframes (1H, 4H, 1D) to validate robustness.

7. **Forward Test**: Paper trade for at least 2-4 weeks before live deployment.
`;

    for await (const chunk of this.yieldBufferedContent(guideContent)) {
      yield chunk;
    }

    onReasoningStep?.({
      provider: "orchestrator",
      model: "quant-solver",
      action: "complete",
      content: "Quant Solver pipeline completed successfully.",
      tokenUsage: accumulatedUsage,
    });
  }

  async* solveTask(
    userPrompt: string | MessageContent[],
    onReasoningStep?: (step: ReasoningStep) => void,
    onTokenUsage?: (usage: TokenUsage) => void
  ): AsyncGenerator<string> {
    if (this.isQuantTask(userPrompt)) {
      yield* this.solveQuantTask(userPrompt, onReasoningStep, onTokenUsage);
      return;
    }

    const enabledProviders = this.providers.filter(p => p.enabled);
    
    if (enabledProviders.length === 0) {
      yield "Error: No LLM providers enabled. Please enable at least one provider in settings.";
      return;
    }

    if (enabledProviders.length === 1) {
      yield* this.solveSingleProvider(userPrompt, enabledProviders[0], onReasoningStep, onTokenUsage);
      return;
    }

    yield* this.solveMultiProvider(userPrompt, enabledProviders, onReasoningStep, onTokenUsage);
  }

  private async* solveSingleProvider(
    userPrompt: string | MessageContent[],
    provider: ProviderConfig,
    onReasoningStep?: (step: ReasoningStep) => void,
    onTokenUsage?: (usage: TokenUsage) => void
  ): AsyncGenerator<string> {
    const systemPrompt = `You are a code-based reasoning engine. You must solve problems by writing Python code.

Your approach:
1. Analyze the problem carefully
2. Write Python code that solves the problem
3. Your code MUST include print() statements to show the result
4. Wrap your code in a \`\`\`python code block

If your code fails, you will receive the error message and must fix it.

Always provide working Python code that prints the solution.`;

    const messages: MessageContent[] = Array.isArray(userPrompt) 
      ? [{ role: "system", content: systemPrompt }, ...userPrompt]
      : [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }];

    let attempts = 0;
    const maxAttempts = 5;
    let solved = false;
    let accumulatedUsage = { inputTokens: 0, outputTokens: 0 };
    let verifiedResponse = "";
    let executionOutput = "";

    onReasoningStep?.({
      provider: "orchestrator",
      model: "agentic-solver",
      action: "analyze",
      content: `Starting single-model solver with ${provider.name} (max ${maxAttempts} attempts)`,
    });

    while (attempts < maxAttempts && !solved) {
      attempts++;

      onReasoningStep?.({
        provider: provider.id,
        model: provider.model,
        action: "think",
        content: `Attempt ${attempts}/${maxAttempts}: Generating code solution...`,
      });

      const { content: response, usage: stepUsage } = await this.collectStreamedResponse(
        provider,
        messages
      );

      accumulatedUsage.inputTokens += stepUsage.inputTokens;
      accumulatedUsage.outputTokens += stepUsage.outputTokens;
      onTokenUsage?.(accumulatedUsage);

      const code = this.extractPythonCode(response);

      if (!code) {
        onReasoningStep?.({
          provider: provider.id,
          model: provider.model,
          action: "error",
          content: `No Python code block found in response. Retrying...`,
          tokenUsage: stepUsage,
        });

        messages.push({ role: "assistant", content: response });
        messages.push({ 
          role: "user", 
          content: "Error: No Python code block found. Please provide your solution as Python code wrapped in ```python code blocks with print() statements to show the result." 
        });
        continue;
      }

      onReasoningStep?.({
        provider: provider.id,
        model: provider.model,
        action: "code",
        content: `Extracted code:\n\`\`\`python\n${code.slice(0, 200)}${code.length > 200 ? '...' : ''}\n\`\`\``,
        tokenUsage: stepUsage,
      });

      const execResult = await this.executePython(code);

      if (execResult.success) {
        onReasoningStep?.({
          provider: "executor",
          model: "python-sandbox",
          action: "verify",
          content: `Code executed successfully:\n${execResult.output}`,
        });

        solved = true;
        verifiedResponse = response;
        executionOutput = execResult.output;
      } else {
        onReasoningStep?.({
          provider: "executor",
          model: "python-sandbox",
          action: "error",
          content: `Execution failed: ${execResult.output}`,
        });

        messages.push({ role: "assistant", content: response });
        messages.push({ 
          role: "user", 
          content: `Error from code execution:\n${execResult.output}\n\nPlease fix the code and try again. Remember to include print() statements to output the result.` 
        });
      }
    }

    onReasoningStep?.({
      provider: "orchestrator",
      model: "agentic-solver",
      action: "complete",
      content: `Completed in ${attempts} attempt(s)`,
      tokenUsage: accumulatedUsage,
    });

    if (solved) {
      const explanationText = verifiedResponse.replace(/```[\s\S]*?```/g, "").trim();
      const cleanAnswer = explanationText 
        ? `${explanationText}\n\n**Result:**\n\`\`\`\n${executionOutput}\n\`\`\``
        : `**Result:**\n\`\`\`\n${executionOutput}\n\`\`\``;
      for await (const chunk of this.yieldBufferedContent(cleanAnswer)) {
        yield chunk;
      }
    } else {
      onReasoningStep?.({
        provider: "orchestrator",
        model: "agentic-solver",
        action: "fail",
        content: `Failed to solve after ${maxAttempts} attempts. Returning last response.`,
      });

      const fallbackContent = "I was unable to solve this problem after multiple attempts. Please try rephrasing your question.";
      for await (const chunk of this.yieldBufferedContent(fallbackContent)) {
        yield chunk;
      }
    }
  }

  private async* solveMultiProvider(
    userPrompt: string | MessageContent[],
    providers: ProviderConfig[],
    onReasoningStep?: (step: ReasoningStep) => void,
    onTokenUsage?: (usage: TokenUsage) => void
  ): AsyncGenerator<string> {
    const taskType = this.taskRouter.classifyTask(userPrompt);
    const strategy = this.taskRouter.selectConsensusStrategy(taskType, this.consensusMode);

    onReasoningStep?.({
      provider: "orchestrator",
      model: "multi-model-solver",
      action: "analyze",
      content: `Starting parallel multi-model solver with ${providers.length} providers. Task type: ${taskType}, Consensus strategy: ${strategy}`,
    });

    yield `*Running ${providers.length} AI models in parallel...*\n\n`;

    const systemPrompt = `You are a code-based reasoning engine. You must solve problems by writing Python code.

Your approach:
1. Analyze the problem carefully
2. Write Python code that solves the problem
3. Your code MUST include print() statements to show the result
4. Wrap your code in a \`\`\`python code block

If your code fails, you will receive the error message and must fix it.

Always provide working Python code that prints the solution.`;

    const messages: MessageContent[] = Array.isArray(userPrompt) 
      ? [{ role: "system", content: systemPrompt }, ...userPrompt]
      : [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }];

    const expertConfigs: ExpertConfig[] = providers.map(p => ({
      ...p,
      temperature: 1.0,
      maxRetries: 5,
    }));

    const runners = expertConfigs.map(config => new ExpertRunner(config));

    for (const config of expertConfigs) {
      onReasoningStep?.({
        provider: config.id,
        model: config.model,
        action: "think",
        content: `Expert ${config.name} starting parallel execution...`,
      });
    }

    const runnerPromises = runners.map((runner, index) => 
      runner.run(messages, (step) => {
        onReasoningStep?.(step);
      })
    );

    const results: ExpertResult[] = await Promise.all(runnerPromises);

    let totalUsage = { inputTokens: 0, outputTokens: 0 };
    for (const result of results) {
      totalUsage.inputTokens += result.usage.inputTokens;
      totalUsage.outputTokens += result.usage.outputTokens;

      onReasoningStep?.({
        provider: result.providerId,
        model: result.model,
        action: result.success ? "verify" : "error",
        content: result.success 
          ? `Completed in ${result.iterations} iteration(s)` 
          : `Failed after ${result.iterations} iteration(s): ${result.error}`,
        tokenUsage: result.usage,
      });
    }
    onTokenUsage?.(totalUsage);

    const successfulResults = results.filter(r => r.success);

    if (successfulResults.length === 0) {
      onReasoningStep?.({
        provider: "orchestrator",
        model: "multi-model-solver",
        action: "fail",
        content: "All experts failed to produce valid solutions.",
      });

      yield "All AI models failed to solve this problem. Please try rephrasing your question.";
      return;
    }

    onReasoningStep?.({
      provider: "orchestrator",
      model: "consensus-engine",
      action: "think",
      content: `Running ${strategy} consensus on ${successfulResults.length} successful responses...`,
    });

    let consensus: ConsensusResult;
    if (strategy === "exact") {
      consensus = this.exactAggregator.aggregate(successfulResults, taskType);
    } else {
      consensus = this.semanticAggregator.aggregate(successfulResults, taskType);
    }

    onReasoningStep?.({
      provider: "orchestrator",
      model: "consensus-engine",
      action: "complete",
      content: `Consensus reached: ${consensus.summary} (${Math.round(consensus.agreement * 100)}% agreement)`,
    });

    yield `**Consensus (${consensus.allGroups.length === 1 ? "unanimous" : `${Math.round(consensus.agreement * 100)}% agreement`}):**\n\n`;

    if (consensus.allGroups.length > 1) {
      const contributingModels = consensus.winningGroup.responses.map(r => r.providerName).join(", ");
      yield `*Models agreeing: ${contributingModels}*\n\n`;
    }

    for await (const chunk of this.yieldBufferedContent(consensus.winningAnswer)) {
      yield chunk;
    }

    if (consensus.allGroups.length > 1) {
      yield "\n\n---\n\n";
      yield `*Alternative perspectives from ${consensus.allGroups.length - 1} other model(s) available. ${consensus.summary}*`;
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

    if (enabledProviders.length === 1) {
      yield* this.chatSingleProvider(messages, enabledProviders[0]);
      return;
    }

    yield* this.chatMultiProvider(messages, enabledProviders);
  }

  private async* chatSingleProvider(
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
    provider: ProviderConfig
  ): AsyncGenerator<string> {
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

  private async* chatMultiProvider(
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
    providers: ProviderConfig[]
  ): AsyncGenerator<string> {
    const lastUserMessage = messages.filter(m => m.role === "user").pop()?.content || "";
    const taskType = this.taskRouter.classifyTask(lastUserMessage);
    const strategy = this.taskRouter.selectConsensusStrategy(taskType, this.consensusMode);

    const systemMessage = {
      role: "system" as const,
      content: "You are a helpful AI assistant. Provide clear, thoughtful responses."
    };
    const fullMessages: MessageContent[] = [systemMessage, ...messages];

    const expertConfigs: ExpertConfig[] = providers.map(p => ({
      ...p,
      temperature: 0.7,
      maxRetries: 1,
    }));

    const runners = expertConfigs.map(config => new ExpertRunner(config));

    const runnerPromises = runners.map(runner => runner.runChat(fullMessages));

    const results = await Promise.all(runnerPromises);

    const successfulResults = results.filter(r => r.success && r.response);

    if (successfulResults.length === 0) {
      yield "Unable to generate a response. Please try again.";
      return;
    }

    if (successfulResults.length === 1) {
      for await (const chunk of this.yieldBufferedContent(successfulResults[0].response)) {
        yield chunk;
      }
      return;
    }

    let consensus: ConsensusResult;
    if (strategy === "exact") {
      consensus = this.exactAggregator.aggregate(successfulResults, taskType);
    } else {
      consensus = this.semanticAggregator.aggregate(successfulResults, taskType);
    }

    for await (const chunk of this.yieldBufferedContent(consensus.winningAnswer)) {
      yield chunk;
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
