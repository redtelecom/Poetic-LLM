import type { TaskType, ConsensusMode } from "./types";
import type { MessageContent } from "./providers";

const STRUCTURED_KEYWORDS = [
  "calculate", "compute", "solve", "what is", "how many", "how much",
  "find the", "determine", "evaluate", "simplify", "factor",
  "python", "code", "program", "algorithm", "function",
  "math", "equation", "formula", "proof",
  "json", "xml", "parse", "format",
  "convert", "translate to",
  "list all", "enumerate", "count",
  "true or false", "yes or no",
  "regex", "pattern match"
];

const OPEN_ENDED_KEYWORDS = [
  "explain", "describe", "discuss", "analyze", "compare",
  "what do you think", "opinion", "perspective",
  "summarize", "overview", "introduction",
  "how would you", "suggest", "recommend",
  "creative", "story", "poem", "essay",
  "brainstorm", "ideas for", "ways to",
  "pros and cons", "advantages", "disadvantages",
  "why do", "what are the reasons"
];

export class TaskRouter {
  classifyTask(userPrompt: string | MessageContent[]): TaskType {
    const text = this.extractText(userPrompt).toLowerCase();
    
    let structuredScore = 0;
    let openEndedScore = 0;

    for (const keyword of STRUCTURED_KEYWORDS) {
      if (text.includes(keyword)) {
        structuredScore++;
      }
    }

    for (const keyword of OPEN_ENDED_KEYWORDS) {
      if (text.includes(keyword)) {
        openEndedScore++;
      }
    }

    const hasCodeBlock = text.includes("```");
    const hasQuestionMark = text.includes("?");
    const hasNumbers = /\d+/.test(text);
    const isShort = text.length < 100;

    if (hasCodeBlock) structuredScore += 2;
    if (hasNumbers && isShort) structuredScore += 1;
    
    if (structuredScore > openEndedScore) {
      return "structured";
    } else if (openEndedScore > structuredScore) {
      return "open_ended";
    }

    return isShort && hasQuestionMark ? "structured" : "open_ended";
  }

  selectConsensusStrategy(taskType: TaskType, mode: ConsensusMode): "exact" | "semantic" {
    if (mode === "exact") return "exact";
    if (mode === "semantic") return "semantic";

    return taskType === "structured" ? "exact" : "semantic";
  }

  private extractText(userPrompt: string | MessageContent[]): string {
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
}
