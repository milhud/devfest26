import { Vote, VoteType, VoteAggregation } from './types';

const WINDOW_SECONDS = 30;
const RATE_HISTORY_SIZE = 20;

class VoteAggregator {
  private votes: Vote[] = [];
  private rateHistory: number[] = [];
  private listeners: Array<(agg: VoteAggregation) => void> = [];

  addVote(vote: Vote): void {
    this.votes.push(vote);
    this.pruneOldVotes();
  }

  onAggregation(listener: (agg: VoteAggregation) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  aggregate(): VoteAggregation {
    this.pruneOldVotes();

    const counts: Partial<Record<VoteType, number>> = {};
    for (const v of this.votes) {
      counts[v.voteType] = (counts[v.voteType] || 0) + 1;
    }

    const total = this.votes.length;
    const voteRate = total / WINDOW_SECONDS;

    // Update running average
    this.rateHistory.push(voteRate);
    if (this.rateHistory.length > RATE_HISTORY_SIZE) {
      this.rateHistory.shift();
    }
    const avgRate =
      this.rateHistory.length > 0
        ? this.rateHistory.reduce((a, b) => a + b, 0) / this.rateHistory.length
        : 0;

    // Find dominant vote
    const sorted = Object.entries(counts).sort(
      (a, b) => (b[1] as number) - (a[1] as number)
    );
    const dominantVote: [string, number] | null =
      sorted.length > 0 ? [sorted[0][0], sorted[0][1] as number] : null;

    // Energy bias: -1 (all chill) to +1 (all hype)
    const energyBias =
      ((counts.energy_up || 0) - (counts.energy_down || 0)) /
      Math.max(total, 1);

    const agg: VoteAggregation = {
      counts,
      total,
      voteRate,
      avgRate,
      isHypeSpike: voteRate > avgRate * 2 && total > 2,
      dominantVote,
      energyBias,
      timestamp: Date.now(),
    };

    // Notify listeners
    for (const listener of this.listeners) {
      listener(agg);
    }

    return agg;
  }

  getLatestAggregation(): VoteAggregation {
    return this.aggregate();
  }

  getRecentVotes(count: number = 10): Vote[] {
    return this.votes.slice(-count);
  }

  private pruneOldVotes(): void {
    const cutoff = Date.now() - WINDOW_SECONDS * 1000;
    this.votes = this.votes.filter((v) => v.timestamp > cutoff);
  }
}

// Session-scoped aggregators
const sessionAggregators = new Map<string, VoteAggregator>();

export function getAggregator(sessionCode: string = '__global__'): VoteAggregator {
  let agg = sessionAggregators.get(sessionCode);
  if (!agg) {
    agg = new VoteAggregator();
    sessionAggregators.set(sessionCode, agg);
  }
  return agg;
}

// Backwards-compatible default (used when no session specified)
export const voteAggregator = getAggregator();
