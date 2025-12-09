import { callOpenAI, callAnthropic, streamOpenAI, streamAnthropic, type ProviderConfig, type ReasoningStep, type TokenUsage, type MessageContent } from "./providers";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export class PoetiqOrchestrator {
  private providers: ProviderConfig[];

  constructor(providers: ProviderConfig[]) {
    this.providers = providers.filter(p => p.enabled);
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

  async* solveTask(
    userPrompt: string | MessageContent[],
    onReasoningStep?: (step: ReasoningStep) => void,
    onTokenUsage?: (usage: TokenUsage) => void
  ): AsyncGenerator<string> {
    const enabledProviders = this.providers.filter(p => p.enabled);
    
    if (enabledProviders.length === 0) {
      yield "Error: No LLM providers enabled. Please enable at least one provider in settings.";
      return;
    }

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

    const primaryProvider = enabledProviders[0];
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
      content: `Starting agentic solver with ${primaryProvider.name} (max ${maxAttempts} attempts)`,
    });

    while (attempts < maxAttempts && !solved) {
      attempts++;

      onReasoningStep?.({
        provider: primaryProvider.id,
        model: primaryProvider.model,
        action: "think",
        content: `Attempt ${attempts}/${maxAttempts}: Generating code solution...`,
      });

      const { content: response, usage: stepUsage } = await this.collectStreamedResponse(
        primaryProvider,
        messages
      );

      accumulatedUsage.inputTokens += stepUsage.inputTokens;
      accumulatedUsage.outputTokens += stepUsage.outputTokens;
      onTokenUsage?.(accumulatedUsage);

      const code = this.extractPythonCode(response);

      if (!code) {
        onReasoningStep?.({
          provider: primaryProvider.id,
          model: primaryProvider.model,
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
        provider: primaryProvider.id,
        model: primaryProvider.model,
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
