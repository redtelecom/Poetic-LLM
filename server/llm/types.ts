import type { TokenUsage, ProviderConfig } from "./providers";

export type TaskType = "structured" | "open_ended";

export type ConsensusMode = "auto" | "exact" | "semantic";

export interface ExpertConfig extends ProviderConfig {
  temperature?: number;
  maxRetries?: number;
  promptPrefix?: string;
}

export interface ExpertResult {
  providerId: string;
  providerName: string;
  model: string;
  response: string;
  canonicalAnswer: string;
  success: boolean;
  iterations: number;
  usage: TokenUsage;
  executionOutput?: string;
  error?: string;
}

export interface ConsensusGroup {
  canonicalAnswer: string;
  responses: ExpertResult[];
  voteCount: number;
  averageSuccess: number;
}

export interface ConsensusResult {
  strategy: "exact" | "semantic";
  taskType: TaskType;
  winningAnswer: string;
  winningGroup: ConsensusGroup;
  allGroups: ConsensusGroup[];
  totalExperts: number;
  agreement: number;
  summary: string;
}

export interface ExpertStreamEvent {
  type: "expert_started" | "expert_progress" | "expert_complete" | "expert_error" | "consensus_started" | "consensus_complete";
  providerId?: string;
  providerName?: string;
  model?: string;
  content?: string;
  result?: ExpertResult;
  consensus?: ConsensusResult;
}
