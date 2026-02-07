import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function generateSessionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1 to avoid confusion
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    if (action === 'create') {
      // End any existing active sessions for this DJ
      await supabase
        .from('sessions')
        .update({ status: 'ended' })
        .eq('dj_id', user.id)
        .eq('status', 'active')

      // Generate unique code
      let code = generateSessionCode()
      let attempts = 0
      while (attempts < 10) {
        const { data: existing } = await supabase
          .from('sessions')
          .select('id')
          .eq('code', code)
          .eq('status', 'active')
          .single()

        if (!existing) break
        code = generateSessionCode()
        attempts++
      }

      // Update profile role to DJ
      await supabase
        .from('profiles')
        .update({ role: 'dj' })
        .eq('id', user.id)

      // Create session
      const { data: session, error: createError } = await supabase
        .from('sessions')
        .insert({
          code,
          dj_id: user.id,
          status: 'active',
        })
        .select()
        .single()

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }

      // DJ auto-joins their own session
      await supabase.from('session_members').insert({
        session_id: session.id,
        user_id: user.id,
      })

      return NextResponse.json({ session })

    } else if (action === 'join') {
      const { code } = body
      if (!code) {
        return NextResponse.json({ error: 'Session code is required' }, { status: 400 })
      }

      // Find active session by code
      const { data: session, error: findError } = await supabase
        .from('sessions')
        .select('*')
        .eq('code', code.toUpperCase())
        .eq('status', 'active')
        .single()

      if (findError || !session) {
        return NextResponse.json({ error: 'Session not found or has ended' }, { status: 404 })
      }

      // Update profile role to audience
      await supabase
        .from('profiles')
        .update({ role: 'audience' })
        .eq('id', user.id)

      // Add user to session (upsert to avoid duplicates)
      await supabase.from('session_members').upsert(
        {
          session_id: session.id,
          user_id: user.id,
        },
        { onConflict: 'session_id,user_id' }
      )

      return NextResponse.json({ session })

    } else {
      return NextResponse.json({ error: 'Invalid action. Use "create" or "join"' }, { status: 400 })
    }
  } catch (err) {
    console.error('Session API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')

    if (code) {
      // Get specific session by code
      const { data: session } = await supabase
        .from('sessions')
        .select('*, session_members(count)')
        .eq('code', code.toUpperCase())
        .eq('status', 'active')
        .single()

      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }

      return NextResponse.json({ session })
    }

    // Get user's active sessions (as DJ)
    const { data: djSessions } = await supabase
      .from('sessions')
      .select('*, session_members(count)')
      .eq('dj_id', user.id)
      .eq('status', 'active')

    // Get sessions user has joined
    const { data: memberSessions } = await supabase
      .from('session_members')
      .select('session_id, sessions(*)')
      .eq('user_id', user.id)

    return NextResponse.json({
      djSessions: djSessions || [],
      memberSessions: memberSessions || [],
    })
  } catch (err) {
    console.error('Session GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
