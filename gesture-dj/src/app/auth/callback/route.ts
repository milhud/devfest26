import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/role-select'

  console.log('[auth/callback] Hit. Params:', {
    hasCode: !!code,
    codePrefix: code?.slice(0, 10) + '...',
    next,
    allParams: Object.fromEntries(searchParams.entries()),
  })

  // Supabase may redirect here with an error instead of a code
  const authError = searchParams.get('error_description')
  const authErrorCode = searchParams.get('error')
  if (authError || authErrorCode) {
    const msg = authError || authErrorCode || 'unknown_error'
    console.error('[auth/callback] OAuth redirect error:', {
      error: authErrorCode,
      error_description: authError,
    })
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(msg)}`
    )
  }

  if (!code) {
    console.error('[auth/callback] No code and no error in query params')
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('No authorization code received')}`)
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  console.log('[auth/callback] Exchanging code for session...')
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[auth/callback] ❌ exchangeCodeForSession FAILED:', {
      message: error.message,
      status: error.status,
      code: error.code,
      name: error.name,
      fullError: JSON.stringify(error, null, 2),
    })
    const userMsg = error.message.includes('exchange')
      ? 'Google code exchange failed. Check Supabase → Auth → Providers → Google credentials (Client ID & Secret must match Google Cloud Console).'
      : error.message
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(userMsg)}`
    )
  }

  console.log('[auth/callback] ✅ Code exchanged. User:', data.user?.id, data.user?.email)

  // Ensure profile exists
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!existingProfile) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: user.id,
        email: user.email,
        display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous',
      })
      if (profileError) {
        console.warn('[auth/callback] Profile insert failed (may already exist):', profileError.message)
      } else {
        console.log('[auth/callback] Created profile for', user.email)
      }
    }
  }

  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv = process.env.NODE_ENV === 'development'

  if (isLocalEnv) {
    return NextResponse.redirect(`${origin}${next}`)
  } else if (forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`)
  } else {
    return NextResponse.redirect(`${origin}${next}`)
  }
}
