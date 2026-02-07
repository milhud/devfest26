import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      return NextResponse.json({
        authenticated: false,
        error: error.message,
        code: error.code,
      })
    }

    if (!user) {
      return NextResponse.json({ authenticated: false, error: 'No user' })
    }

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      email: user.email,
      name: user.user_metadata?.full_name,
    })
  } catch (err) {
    return NextResponse.json({
      authenticated: false,
      error: String(err),
    })
  }
}
