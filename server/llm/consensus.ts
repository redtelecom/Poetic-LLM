import type { ExpertResult, ConsensusGroup, ConsensusResult, TaskType } from "./types";

export function canonicalizeAnswer(answer: string): string {
  let canonical = answer
    .replace(/```[\s\S]*?```/g, match => {
      const code = match.replace(/```\w*\n?/g, "").replace(/```/g, "").trim();
      return `[CODE:${code}]`;
    })
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  canonical = canonical.replace(/\*\*([^*]+)\*\*/g, "$1");
  canonical = canonical.replace(/__([^_]+)__/g, "$1");
  canonical = canonical.replace(/\*([^*]+)\*/g, "$1");
  canonical = canonical.replace(/_([^_]+)_/g, "$1");

  return canonical;
}

export function extractFinalAnswer(response: string): string {
  const patterns = [
    /\*\*(?:answer|result|solution|final answer)[:\s]*\*\*\s*(.+?)(?:\n|$)/i,
    /(?:answer|result|solution|final answer)[:\s]+(.+?)(?:\n|$)/i,
    /```\n([^`]+)\n```/,
    /^(.+)$/m
  ];

  for (const pattern of patterns) {
    const match = response.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return response.slice(0, 200);
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

export class ExactMatchAggregator {
  aggregate(results: ExpertResult[], taskType: TaskType): ConsensusResult {
    const groups = new Map<string, ExpertResult[]>();

    for (const result of results) {
      const key = result.canonicalAnswer;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(result);
    }

    const consensusGroups: ConsensusGroup[] = Array.from(groups.entries())
      .map(([canonicalAnswer, responses]) => ({
        canonicalAnswer,
        responses,
        voteCount: responses.length,
        averageSuccess: responses.filter(r => r.success).length / responses.length
      }))
      .sort((a, b) => {
        if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
        return b.averageSuccess - a.averageSuccess;
      });

    const winningGroup = consensusGroups[0];
    const agreement = winningGroup.voteCount / results.length;

    const summary = this.buildSummary(consensusGroups, results.length);

    return {
      strategy: "exact",
      taskType,
      winningAnswer: winningGroup.responses[0].response,
      winningGroup,
      allGroups: consensusGroups,
      totalExperts: results.length,
      agreement,
      summary
    };
  }

  private buildSummary(groups: ConsensusGroup[], total: number): string {
    if (groups.length === 1) {
      return `All ${total} models agree on the answer.`;
    }

    const winner = groups[0];
    const providerNames = winner.responses.map(r => r.providerName).join(", ");
    
    if (winner.voteCount > total / 2) {
      return `${winner.voteCount}/${total} models (${providerNames}) agree. ${groups.length - 1} alternative answer(s) found.`;
    }

    return `No clear consensus. ${groups.length} different answers from ${total} models. Showing most common answer.`;
  }
}

export class SemanticAggregator {
  private similarityThreshold = 0.7;

  aggregate(results: ExpertResult[], taskType: TaskType): ConsensusResult {
    const clusters: ExpertResult[][] = [];

    for (const result of results) {
      let addedToCluster = false;

      for (const cluster of clusters) {
        const representative = cluster[0];
        const similarity = stringSimilarity(
          result.canonicalAnswer,
          representative.canonicalAnswer
        );

        if (similarity >= this.similarityThreshold) {
          cluster.push(result);
          addedToCluster = true;
          break;
        }
      }

      if (!addedToCluster) {
        clusters.push([result]);
      }
    }

    const consensusGroups: ConsensusGroup[] = clusters
      .map(cluster => {
        const bestResult = cluster.reduce((best, curr) => 
          curr.success && !best.success ? curr : 
          curr.response.length > best.response.length ? curr : best
        );

        return {
          canonicalAnswer: bestResult.canonicalAnswer,
          responses: cluster,
          voteCount: cluster.length,
          averageSuccess: cluster.filter(r => r.success).length / cluster.length
        };
      })
      .sort((a, b) => {
        if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
        return b.averageSuccess - a.averageSuccess;
      });

    const winningGroup = consensusGroups[0];
    const bestResponse = winningGroup.responses.reduce((best, curr) =>
      curr.response.length > best.response.length ? curr : best
    );
    const agreement = winningGroup.voteCount / results.length;

    const summary = this.buildSummary(consensusGroups, results.length);

    return {
      strategy: "semantic",
      taskType,
      winningAnswer: bestResponse.response,
      winningGroup,
      allGroups: consensusGroups,
      totalExperts: results.length,
      agreement,
      summary
    };
  }

  private buildSummary(groups: ConsensusGroup[], total: number): string {
    if (groups.length === 1) {
      return `All ${total} models provided semantically similar answers.`;
    }

    const winner = groups[0];
    const providerNames = winner.responses.map(r => r.providerName).join(", ");

    if (winner.voteCount > total / 2) {
      return `${winner.voteCount}/${total} models (${providerNames}) gave similar answers. Synthesized best response from cluster.`;
    }

    return `Diverse perspectives from ${total} models across ${groups.length} clusters. Showing most supported viewpoint.`;
  }
}
