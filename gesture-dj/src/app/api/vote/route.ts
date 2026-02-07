import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { Vote, VoteType } from '@/lib/types';
import { voteAggregator } from '@/lib/vote-aggregator';

const VALID_VOTE_TYPES: VoteType[] = [
  'energy_up',
  'energy_down',
  'genre_switch',
  'drop_request',
  'viz_style',
  'speed_up',
  'speed_down',
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, voteType, voteValue } = body;

    if (!userId || !voteType) {
      return NextResponse.json(
        { error: 'Missing userId or voteType' },
        { status: 400 }
      );
    }

    if (!VALID_VOTE_TYPES.includes(voteType)) {
      return NextResponse.json(
        { error: `Invalid voteType. Must be one of: ${VALID_VOTE_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const vote: Vote = {
      id: uuidv4(),
      userId,
      voteType,
      voteValue: voteValue || undefined,
      timestamp: Date.now(),
    };

    // Add to aggregator
    voteAggregator.addVote(vote);

    // Get current aggregation
    const aggregation = voteAggregator.getLatestAggregation();

    return NextResponse.json({
      success: true,
      voteId: vote.id,
      aggregation: {
        total: aggregation.total,
        isHypeSpike: aggregation.isHypeSpike,
        dominantVote: aggregation.dominantVote,
        energyBias: aggregation.energyBias,
      },
    });
  } catch (error) {
    console.error('Vote submission error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const aggregation = voteAggregator.getLatestAggregation();
  const recentVotes = voteAggregator.getRecentVotes(20);

  return NextResponse.json({
    aggregation,
    recentVotes,
  });
}
