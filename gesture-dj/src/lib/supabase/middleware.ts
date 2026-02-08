import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Do not add logic between createServerClient and supabase.auth.getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  console.log(`[middleware] ${pathname} — user: ${user?.id ?? 'NONE'}`)

  // Public routes that don't require auth
  const publicRoutes = ['/login', '/auth/callback', '/projector']
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  )

  // API routes are protected separately (they check auth in handlers)
  const isApiRoute = pathname.startsWith('/api')

  if (!user && !isPublicRoute && !isApiRoute) {
    console.log(`[middleware] Redirecting ${pathname} → /login (no user)`)
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // If user is logged in and on /login, redirect to role-select
  if (user && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/role-select'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
