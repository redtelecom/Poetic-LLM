import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { ExpertConfig, ExpertResult } from "./types";
import type { MessageContent, TokenUsage, ReasoningStep } from "./providers";
import { streamOpenAI, streamAnthropic, streamOpenRouter, streamCustomProvider } from "./providers";
import { canonicalizeAnswer, extractFinalAnswer } from "./consensus";

export class ExpertRunner {
  private config: ExpertConfig;

  constructor(config: ExpertConfig) {
    this.config = config;
  }

  async run(
    messages: MessageContent[],
    onProgress?: (step: ReasoningStep) => void
  ): Promise<ExpertResult> {
    const maxAttempts = this.config.maxRetries || 5;
    let attempts = 0;
    let solved = false;
    let accumulatedUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let finalResponse = "";
    let executionOutput = "";
    let lastError = "";

    const workingMessages = [...messages];

    onProgress?.({
      provider: this.config.id,
      model: this.config.model,
      action: "think",
      content: `Expert ${this.config.name} starting (max ${maxAttempts} attempts)`,
    });

    while (attempts < maxAttempts && !solved) {
      attempts++;

      onProgress?.({
        provider: this.config.id,
        model: this.config.model,
        action: "code",
        content: `Attempt ${attempts}/${maxAttempts}: Generating solution...`,
      });

      try {
        const { content: response, usage } = await this.collectStreamedResponse(workingMessages);

        accumulatedUsage.inputTokens += usage.inputTokens;
        accumulatedUsage.outputTokens += usage.outputTokens;

        const code = this.extractPythonCode(response);

        if (!code) {
          onProgress?.({
            provider: this.config.id,
            model: this.config.model,
            action: "error",
            content: `No Python code block found. Retrying...`,
          });

          workingMessages.push({ role: "assistant", content: response });
          workingMessages.push({
            role: "user",
            content: "Error: No Python code block found. Please provide your solution as Python code wrapped in ```python code blocks with print() statements."
          });
          continue;
        }

        const execResult = await this.executePython(code);

        if (execResult.success) {
          onProgress?.({
            provider: this.config.id,
            model: this.config.model,
            action: "verify",
            content: `Code executed successfully: ${execResult.output.slice(0, 100)}`,
          });

          solved = true;
          finalResponse = response;
          executionOutput = execResult.output;
        } else {
          lastError = execResult.output;
          onProgress?.({
            provider: this.config.id,
            model: this.config.model,
            action: "error",
            content: `Execution failed: ${execResult.output.slice(0, 100)}`,
          });

          workingMessages.push({ role: "assistant", content: response });
          workingMessages.push({
            role: "user",
            content: `Error from code execution:\n${execResult.output}\n\nPlease fix the code and try again.`
          });
        }
      } catch (err: any) {
        lastError = err.message;
        onProgress?.({
          provider: this.config.id,
          model: this.config.model,
          action: "error",
          content: `API error: ${err.message}`,
        });
      }
    }

    const canonicalAnswer = solved 
      ? canonicalizeAnswer(executionOutput)
      : canonicalizeAnswer(finalResponse || lastError);

    return {
      providerId: this.config.id,
      providerName: this.config.name,
      model: this.config.model,
      response: solved ? this.formatSuccessResponse(finalResponse, executionOutput) : finalResponse,
      canonicalAnswer,
      success: solved,
      iterations: attempts,
      usage: accumulatedUsage,
      executionOutput: solved ? executionOutput : undefined,
      error: solved ? undefined : lastError
    };
  }

  async runChat(
    messages: MessageContent[],
    onProgress?: (step: ReasoningStep) => void
  ): Promise<ExpertResult> {
    let accumulatedUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    onProgress?.({
      provider: this.config.id,
      model: this.config.model,
      action: "think",
      content: `Expert ${this.config.name} generating response...`,
    });

    try {
      const { content: response, usage } = await this.collectStreamedResponse(messages);
      accumulatedUsage = usage;

      const canonicalAnswer = canonicalizeAnswer(extractFinalAnswer(response));

      return {
        providerId: this.config.id,
        providerName: this.config.name,
        model: this.config.model,
        response,
        canonicalAnswer,
        success: true,
        iterations: 1,
        usage: accumulatedUsage,
      };
    } catch (err: any) {
      return {
        providerId: this.config.id,
        providerName: this.config.name,
        model: this.config.model,
        response: "",
        canonicalAnswer: "",
        success: false,
        iterations: 1,
        usage: accumulatedUsage,
        error: err.message
      };
    }
  }

  private async collectStreamedResponse(
    messages: MessageContent[]
  ): Promise<{ content: string; usage: TokenUsage }> {
    let content = "";
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    const handleUsage = (u: TokenUsage) => {
      usage = u;
    };

    if (this.config.id === "openai") {
      for await (const chunk of streamOpenAI(this.config.model, messages, handleUsage)) {
        content += chunk;
      }
    } else if (this.config.id === "anthropic") {
      for await (const chunk of streamAnthropic(this.config.model, messages, handleUsage)) {
        content += chunk;
      }
    } else if (this.config.id === "openrouter") {
      for await (const chunk of streamOpenRouter(this.config.model, messages, handleUsage)) {
        content += chunk;
      }
    } else if ((this.config as any).isCustom) {
      for await (const chunk of streamCustomProvider(this.config as any, messages, handleUsage)) {
        content += chunk;
      }
    }

    return { content, usage };
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
        } catch (e) {}
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

        const pythonProcess = spawn("python3", [tempFile], { cwd: tempDir });

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

  private formatSuccessResponse(response: string, executionOutput: string): string {
    const explanationText = response.replace(/```[\s\S]*?```/g, "").trim();
    if (explanationText) {
      return `${explanationText}\n\n**Result:**\n\`\`\`\n${executionOutput}\n\`\`\``;
    }
    return `**Result:**\n\`\`\`\n${executionOutput}\n\`\`\``;
  }
}
