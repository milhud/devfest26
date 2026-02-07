import { nextRouteHandler } from '@flowglad/nextjs/server';
import { flowglad } from '@/lib/flowglad';
import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

const handler = nextRouteHandler({
  flowglad,
  getCustomerExternalId: async (req) => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    // Return user ID if authenticated, otherwise a guest placeholder
    // This prevents FlowgladProvider from crashing on unauthenticated pages
    return user?.id ?? 'guest';
  },
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    return await handler.GET(req, ctx);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[flowglad] GET error:', msg);
    if (msg.includes('401') || msg.includes('API key')) {
      return NextResponse.json(
        { error: 'Flowglad API key invalid — check FLOWGLAD_SECRET_KEY in .env.local' },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    return await handler.POST(req, ctx);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[flowglad] POST error:', msg);
    if (msg.includes('401') || msg.includes('API key')) {
      return NextResponse.json(
        { error: 'Flowglad API key invalid — check FLOWGLAD_SECRET_KEY in .env.local' },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
