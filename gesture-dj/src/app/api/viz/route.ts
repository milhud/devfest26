import { NextResponse } from 'next/server';

// In-memory store for viz parameters (agent can POST, projector can GET)
let vizParams: Record<string, unknown> = {
  colorPalette: ['#ff00ff', '#00ffff', '#ffff00', '#ff0088'],
  vizTheme: 'neon',
  cameraMode: 'orbit',
  energy: 0.5,
  animationIntensity: 0.7,
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    vizParams = { ...vizParams, ...body };
    return NextResponse.json({ success: true, params: vizParams });
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json(vizParams);
}
