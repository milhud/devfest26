import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { Vote, VoteType, VoteAggregation } from '@/lib/types';
import { getAggregator } from '@/lib/vote-aggregator';
// Broadcast votes via HTTP POST to WS server's /broadcast endpoint
// (more reliable than maintaining a WS client from Next.js API routes)
function broadcastVote(vote: Vote, aggregation: VoteAggregation) {
  const wsHttpUrl = process.env.WS_SERVER_HTTP_URL || 'http://localhost:8080';
  fetch(`${wsHttpUrl}/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'votes',
      type: 'vote_cast',
      data: { vote, aggregation },
      timestamp: Date.now(),
    }),
  }).catch(() => { /* non-fatal — WS server may not be running */ });
}

const VALID_VOTE_TYPES: VoteType[] = [
  'energy_up',
  'energy_down',
  'genre_switch',
  'drop_request',
  'viz_style',
  'speed_up',
  'speed_down',
];

// Server-side rate limiting: 1 vote per second per userId
const RATE_LIMIT_MS = 1000;
const lastVoteTime = new Map<string, number>();

// Clean up stale entries every 60s to prevent memory leak
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, ts] of lastVoteTime) {
    if (ts < cutoff) lastVoteTime.delete(key);
  }
}, 60_000);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, voteType, voteValue, sessionCode } = body;

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

    // Rate limit check
    const now = Date.now();
    const lastTime = lastVoteTime.get(userId);
    if (lastTime && now - lastTime < RATE_LIMIT_MS) {
      return NextResponse.json(
        { error: 'Too fast — wait a moment between votes' },
        { status: 429 }
      );
    }
    lastVoteTime.set(userId, now);

    const vote: Vote = {
      id: uuidv4(),
      userId,
      voteType,
      voteValue: voteValue || undefined,
      timestamp: Date.now(),
    };

    // Add to session-scoped aggregator
    const aggregator = getAggregator(sessionCode);
    aggregator.addVote(vote);

    // Get current aggregation
    const aggregation = aggregator.getLatestAggregation();

    // Broadcast to WS for real-time updates
    broadcastVote(vote, aggregation);

    return NextResponse.json({
      success: true,
      voteId: vote.id,
      aggregation,
    });
  } catch (error) {
    console.error('Vote submission error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const sessionCode = req.nextUrl.searchParams.get('session') || undefined;
  const aggregator = getAggregator(sessionCode);
  const aggregation = aggregator.getLatestAggregation();
  const recentVotes = aggregator.getRecentVotes(20);

  return NextResponse.json({
    aggregation,
    recentVotes,
  });
}
