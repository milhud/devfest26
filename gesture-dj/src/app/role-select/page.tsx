'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function RoleSelectPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string; email?: string; name?: string } | null>(null)
  const [sessionCode, setSessionCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser({
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || user.email?.split('@')[0],
        })
      }
    })
  }, [])

  const handleStartDJSession = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create session')
      router.push(`/dashboard?session=${data.session.code}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinSession = async () => {
    if (!sessionCode.trim()) {
      setError('Enter a session code')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', code: sessionCode.trim().toUpperCase() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to join session')
      router.push(`/vote?session=${data.session.code}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to join session')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Animated background */}
      <div className="bg-scene" />
      <div className="bg-grid" />

      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-purple-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full bg-pink-600/8 blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center px-6 max-w-2xl w-full">
        {/* User greeting */}
        {user && (
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass mb-6">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-gray-300">
              Welcome, {user.name}
            </span>
            <button
              onClick={handleSignOut}
              className="ml-2 text-[10px] text-gray-500 hover:text-gray-300 underline transition-colors cursor-pointer"
            >
              sign out
            </button>
          </div>
        )}

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-center mb-2">
          Choose Your{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 text-glow-purple">
            Role
          </span>
        </h1>

        <p className="text-gray-400 text-base text-center mb-10">
          Are you running the show or joining the crowd?
        </p>

        {/* Error */}
        {error && (
          <div className="w-full mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Role cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full mb-6">
          {/* DJ Card */}
          <button
            onClick={handleStartDJSession}
            disabled={loading}
            className="group relative rounded-2xl glass p-8 text-center flex flex-col transition-all duration-300
              hover:bg-white/[0.04] hover:border-purple-500/30 hover:scale-[1.02]
              disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10 flex flex-col items-center flex-1">
              <div className="w-16 h-16 mx-auto rounded-xl bg-purple-500/10 flex items-center justify-center text-4xl mb-4 group-hover:scale-110 transition-transform">
                🎧
              </div>
              <div className="font-bold text-xl mb-2">I&apos;m the DJ</div>
              <div className="text-gray-500 text-sm leading-relaxed mb-6">
                Start a new session and get a code to share with the audience
              </div>
              <div className="mt-auto w-full px-4 py-3 rounded-xl bg-purple-500/10 border border-purple-500/20
                text-purple-300 text-sm font-semibold
                group-hover:bg-purple-500/20 group-hover:border-purple-500/30
                transition-all">
                {loading ? 'Creating...' : 'Start Session →'}
              </div>
            </div>
          </button>

          {/* Audience Card */}
          <div className="group relative rounded-2xl glass p-8 text-center flex flex-col transition-all duration-300
            hover:bg-white/[0.04] hover:border-cyan-500/30">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10 flex flex-col items-center flex-1">
              <div className="w-16 h-16 mx-auto rounded-xl bg-cyan-500/10 flex items-center justify-center text-4xl mb-4 group-hover:scale-110 transition-transform">
                🗳️
              </div>
              <div className="font-bold text-xl mb-2">Join Session</div>
              <div className="text-gray-500 text-sm leading-relaxed mb-6">
                Enter the 6-character code from your DJ to start voting
              </div>
              <div className="mt-auto w-full space-y-3">
                <input
                  type="text"
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                  placeholder="ENTER CODE"
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white
                    text-center font-mono text-lg tracking-[0.3em] uppercase
                    placeholder:text-gray-600 placeholder:tracking-[0.2em] placeholder:text-sm
                    focus:outline-none focus:border-cyan-500/40 focus:bg-white/[0.07]
                    transition-all"
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinSession()}
                />
                <button
                  onClick={handleJoinSession}
                  disabled={loading || !sessionCode.trim()}
                  className="w-full px-4 py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20
                    text-cyan-300 text-sm font-semibold
                    hover:bg-cyan-500/20 hover:border-cyan-500/30
                    disabled:opacity-30 disabled:cursor-not-allowed
                    transition-all cursor-pointer"
                >
                  {loading ? 'Joining...' : 'Join Session →'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <div className="text-[11px] text-gray-600 tracking-wide">
            DJ gets a session code &middot; Audience enters it to join &middot; Vote in real-time
          </div>
        </div>
      </div>
    </div>
  )
}
