import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/role-select");
  }

  return (
    <div className="min-h-screen text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Animated background */}
      <div className="bg-scene" />
      <div className="bg-grid" />

      {/* Hero glow orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-purple-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] rounded-full bg-cyan-600/8 blur-[100px] pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-6 max-w-2xl w-full">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass mb-6">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-medium text-gray-300 tracking-wide">DevFest 2026 — Live Demo</span>
        </div>

        {/* Title */}
        <h1 className="text-6xl sm:text-7xl font-black tracking-tighter text-center mb-4">
          GESTURE{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 text-glow-purple">
            DJ
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-gray-400 text-lg sm:text-xl text-center mb-3 max-w-md leading-relaxed">
          Hand gestures control the music. The crowd shapes the vibe. An AI brain runs the show.
        </p>

        {/* Tech pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {['MediaPipe', 'Tone.js', 'Three.js', 'K2 Think', 'Dedalus', 'Flowglad'].map((tech) => (
            <span key={tech} className="px-3 py-1 rounded-full text-[11px] font-medium text-gray-400 bg-white/5 border border-white/5">
              {tech}
            </span>
          ))}
        </div>

        {/* Navigation cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
          <Link
            href="/dashboard"
            className="group relative rounded-2xl glass p-6 text-center transition-all duration-300
              hover:bg-white/[0.04] hover:border-purple-500/30 hover:scale-[1.02]"
          >
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10">
              <div className="w-14 h-14 mx-auto rounded-xl bg-purple-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </div>
              <div className="font-bold text-lg mb-1">Dashboard</div>
              <div className="text-gray-500 text-xs">Presentation view</div>
            </div>
          </Link>

          <Link
            href="/vote"
            className="group relative rounded-2xl glass p-6 text-center transition-all duration-300
              hover:bg-white/[0.04] hover:border-pink-500/30 hover:scale-[1.02]"
          >
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-pink-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10">
              <div className="w-14 h-14 mx-auto rounded-xl bg-pink-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7 text-pink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2c.5 2.5 2 4.5 2 7a4 4 0 1 1-8 0c0-2.5 2-4 3-6 1 2 2.5 3 3 5s1-3 0-6z" fill="currentColor" fillOpacity="0.1" />
                  <path d="M12 2c.5 2.5 2 4.5 2 7a4 4 0 1 1-8 0c0-2.5 2-4 3-6 1 2 2.5 3 3 5s1-3 0-6z" />
                </svg>
              </div>
              <div className="font-bold text-lg mb-1">Vote</div>
              <div className="text-gray-500 text-xs">Audience mobile voting</div>
            </div>
          </Link>

          <a
            href="/api/vote"
            className="group relative rounded-2xl glass p-6 text-center transition-all duration-300
              hover:bg-white/[0.04] hover:border-cyan-500/30 hover:scale-[1.02]"
          >
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10">
              <div className="w-14 h-14 mx-auto rounded-xl bg-cyan-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" fillOpacity="0.1" />
                </svg>
              </div>
              <div className="font-bold text-lg mb-1">API</div>
              <div className="text-gray-500 text-xs">Vote + Agent endpoints</div>
            </div>
          </a>
        </div>

        {/* Footer */}
        <div className="mt-14 text-center space-y-2">
          <div className="text-[11px] text-gray-600 tracking-wide">
            Powered by <span className="text-purple-500/50">Dedalus</span> &middot; <span className="text-cyan-500/50">K2 Think</span> &middot; <span className="text-pink-500/50">Flowglad</span>
          </div>
          <div className="font-mono text-[10px] text-gray-700 glass inline-block px-3 py-1 rounded-lg">
            npm run dev &nbsp;|&nbsp; npm run ws-server &nbsp;|&nbsp; npm run agent
          </div>
        </div>
      </div>
    </div>
  );
}
