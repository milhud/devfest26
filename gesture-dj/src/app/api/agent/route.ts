import { NextResponse } from 'next/server';

interface AgentDecisionRecord {
  reasoning: string;
  actions: Array<{ type: string; value: unknown }>;
  confidence: number;
  audioState: Record<string, unknown>;
  timestamp: number;
}

// In-memory store for latest agent decision (updated via WS or direct POST)
let latestDecision: AgentDecisionRecord | null = null;
let decisionHistory: AgentDecisionRecord[] = [];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    latestDecision = {
      reasoning: body.reasoning || '',
      actions: body.actions || [],
      confidence: body.confidence || 0,
      audioState: body.audioState || {},
      timestamp: Date.now(),
    };
    decisionHistory.push(latestDecision);
    if (decisionHistory.length > 50) {
      decisionHistory = decisionHistory.slice(-50);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Agent POST error:', error);
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    latestDecision,
    recentDecisions: decisionHistory.slice(-5),
    totalDecisions: decisionHistory.length,
  });
}

export async function DELETE() {
  latestDecision = null;
  decisionHistory = [];
  return NextResponse.json({ success: true, message: 'Agent decisions cleared' });
}
