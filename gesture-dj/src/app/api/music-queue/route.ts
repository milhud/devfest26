import { NextRequest, NextResponse } from 'next/server';

export interface MusicQueueItem {
  id: string;
  prompt: string;
  genre: string;
  bpm: number;
  energy: number;
  mood: string;
  duration_seconds: number;
  status: 'queued' | 'generating' | 'ready' | 'playing' | 'failed';
  createdAt: number;
  audioUrl?: string;
  error?: string;
  agentReasoning?: string;
}

// In-memory music generation queue
const musicQueue: MusicQueueItem[] = [];

// POST: Agent queues a new music generation request
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, genre, bpm, energy, mood, duration_seconds, agentReasoning } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const item: MusicQueueItem = {
      id: `mq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      prompt,
      genre: genre || 'electronic',
      bpm: bpm || 128,
      energy: energy || 0.5,
      mood: mood || 'energetic',
      duration_seconds: duration_seconds || 30,
      status: 'queued',
      createdAt: Date.now(),
      agentReasoning: agentReasoning || undefined,
    };

    musicQueue.push(item);

    // Keep queue at max 20 items
    while (musicQueue.length > 20) {
      musicQueue.shift();
    }

    console.log(`[Music Queue] New item: "${prompt.slice(0, 60)}..." (${genre}, ${bpm}bpm)`);

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error('Music queue POST error:', error);
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
}

// GET: List queue items. ?status=queued to filter.
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status');

  const items = status
    ? musicQueue.filter((i) => i.status === status)
    : musicQueue;

  // Next track to play = oldest "ready" item
  const nextReady = musicQueue.find((i) => i.status === 'ready');

  return NextResponse.json({
    queue: items,
    total: musicQueue.length,
    queued: musicQueue.filter((i) => i.status === 'queued').length,
    generating: musicQueue.filter((i) => i.status === 'generating').length,
    ready: musicQueue.filter((i) => i.status === 'ready').length,
    nextReady: nextReady || null,
  });
}

// DELETE: Clear the entire music queue
export async function DELETE() {
  musicQueue.length = 0;
  return NextResponse.json({ success: true, message: 'Music queue cleared' });
}

// PATCH: Teammates update item status (generating → ready, add audioUrl, etc.)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, audioUrl, error } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const item = musicQueue.find((i) => i.id === id);
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (status) item.status = status;
    if (audioUrl) item.audioUrl = audioUrl;
    if (error) {
      item.error = error;
      item.status = 'failed';
    }

    console.log(`[Music Queue] Updated ${id}: status=${item.status}`);

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error('Music queue PATCH error:', error);
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
}
