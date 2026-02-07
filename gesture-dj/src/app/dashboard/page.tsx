'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { VoteAggregation, Vote } from '@/lib/types';
import { Suspense } from 'react';

interface AgentDecision {
  reasoning: string;
  actions: Array<{ type: string; value: unknown }>;
  confidence: number;
  audioState: Record<string, unknown>;
  timestamp: number;
}

const VOTE_EMOJIS: Record<string, string> = {
  energy_up: '🔥',
  energy_down: '❄️',
  drop_request: '💥',
  genre_switch: '🔄',
  viz_style: '🎨',
  speed_up: '⚡',
  speed_down: '🐌',
};

const VOTE_COLORS: Record<string, string> = {
  energy_up: 'text-orange-400',
  energy_down: 'text-cyan-400',
  drop_request: 'text-yellow-400',
  genre_switch: 'text-purple-400',
  viz_style: 'text-pink-400',
  speed_up: 'text-emerald-400',
  speed_down: 'text-blue-400',
};

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionCode = searchParams.get('session');
  const [memberCount, setMemberCount] = useState(0);

  const [aggregation, setAggregation] = useState<VoteAggregation | null>(null);
  const [recentVotes, setRecentVotes] = useState<Vote[]>([]);
  const [agentData, setAgentData] = useState<{
    latestDecision: AgentDecision | null;
    recentDecisions: AgentDecision[];
    totalDecisions: number;
  }>({ latestDecision: null, recentDecisions: [], totalDecisions: 0 });

  // Poll session member count
  useEffect(() => {
    if (!sessionCode) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/sessions?code=${sessionCode}`);
        if (res.ok) {
          const data = await res.json();
          setMemberCount(data.session?.session_members?.[0]?.count || 0);
        }
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [sessionCode]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleEndSession = async () => {
    if (!sessionCode) return;
    // Just sign out — session stays for reference
    handleSignOut();
  };

  // Poll votes
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/vote');
        if (res.ok) {
          const data = await res.json();
          setAggregation(data.aggregation);
          setRecentVotes(data.recentVotes || []);
        }
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

  // Poll agent decisions
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/agent');
        if (res.ok) {
          const data = await res.json();
          setAgentData(data);
        }
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  const decision = agentData.latestDecision;
  const audioState = decision?.audioState;
  const energyPercent = ((aggregation?.energyBias ?? 0) + 1) / 2 * 100;
  const energyValue = Number(audioState?.energy || 0.5);

  return (
    <div className="min-h-screen text-white relative">
      {/* Animated background */}
      <div className="bg-scene" />
      <div className="bg-grid" />

      {/* Content */}
      <div className="relative z-10 p-4 lg:p-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl lg:text-3xl font-black tracking-tight">
              GESTURE{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400">
                DJ
              </span>
            </h1>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full glass text-xs">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 font-bold tracking-wider">LIVE</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {sessionCode && (
              <div className="glass rounded-lg px-3 py-1.5 flex items-center gap-2">
                <span className="text-gray-500 text-xs">Session</span>
                <span className="font-mono font-bold text-lg tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                  {sessionCode}
                </span>
                <span className="text-gray-600 text-xs">· {memberCount} joined</span>
              </div>
            )}
            {aggregation?.isHypeSpike && (
              <span className="px-3 py-1.5 bg-red-500/15 border border-red-500/30 text-red-400 rounded-full font-bold animate-hype glow-orange text-xs tracking-wider">
                HYPE SPIKE
              </span>
            )}
            <div className="glass rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className="text-gray-500 text-xs">Agent</span>
              <span className="font-bold text-purple-300">{agentData.totalDecisions}</span>
            </div>
            <button
              onClick={handleEndSession}
              className="glass rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:text-red-400 hover:border-red-500/30 transition-colors cursor-pointer"
            >
              End Session
            </button>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-3 lg:gap-4">
          {/* Left: Current Params + Vote Counts */}
          <div className="col-span-12 lg:col-span-3 space-y-3">
            <Panel title="AUDIO STATE" accent="purple">
              <div className="space-y-0.5">
                <ParamRow label="Genre" value={String(audioState?.genre || 'house')} color="text-purple-300" />
                <ParamRow label="BPM" value={String(audioState?.bpm || 128)} color="text-cyan-300" />
                <ParamRow label="Energy" color="text-orange-300">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-orange-400 transition-all duration-500"
                        style={{ width: `${energyValue * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs font-bold text-orange-300">
                      {(energyValue * 100).toFixed(0)}%
                    </span>
                  </div>
                </ParamRow>
                <ParamRow label="Theme" value={String(audioState?.vizTheme || 'cyber')} color="text-pink-300" />
                <ParamRow
                  label="Complexity"
                  value={`${((Number(audioState?.sceneComplexity) || 0.5) * 100).toFixed(0)}%`}
                  color="text-emerald-300"
                />
              </div>
            </Panel>

            <Panel title="VOTE BREAKDOWN" accent="cyan">
              {aggregation?.counts && Object.keys(aggregation.counts).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(aggregation.counts)
                    .sort((a, b) => (b[1] as number) - (a[1] as number))
                    .map(([type, count]) => {
                      const maxCount = Math.max(...Object.values(aggregation.counts!).map(Number));
                      const pct = maxCount > 0 ? ((count as number) / maxCount) * 100 : 0;
                      return (
                        <div key={type}>
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="text-xs text-gray-400 flex items-center gap-1.5">
                              <span>{VOTE_EMOJIS[type] || '•'}</span>
                              {type.replace(/_/g, ' ')}
                            </span>
                            <span className={`font-bold text-xs ${VOTE_COLORS[type] || 'text-white'}`}>{count}</span>
                          </div>
                          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-purple-500/60 to-cyan-500/60"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-gray-600 text-xs">Waiting for votes...</p>
              )}
            </Panel>
          </div>

          {/* Center: Webcam + Viz + Energy */}
          <div className="col-span-12 lg:col-span-6 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="aspect-video glass rounded-xl flex items-center justify-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-transparent" />
                <div className="relative z-10 text-center">
                  <div className="text-2xl mb-2 opacity-30">📹</div>
                  <span className="text-gray-600 text-[10px] tracking-[0.15em] font-bold uppercase">Webcam + Gestures</span>
                </div>
                <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/30 text-[9px] text-gray-500 font-medium">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                  Stream A
                </div>
              </div>
              <div className="aspect-video glass rounded-xl flex items-center justify-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/5 to-transparent" />
                <div className="relative z-10 text-center">
                  <div className="text-2xl mb-2 opacity-30">🎆</div>
                  <span className="text-gray-600 text-[10px] tracking-[0.15em] font-bold uppercase">3D Visualization</span>
                </div>
                <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/30 text-[9px] text-gray-500 font-medium">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                  Stream B
                </div>
              </div>
            </div>

            {/* Energy Bar */}
            <Panel title="CROWD ENERGY" accent="magenta">
              <div className="h-5 bg-white/5 rounded-full overflow-hidden energy-bar-glow relative">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out relative"
                  style={{
                    width: `${energyPercent}%`,
                    background: 'linear-gradient(90deg, #06b6d4, #a855f7 40%, #ec4899 70%, #f97316)',
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full" />
                </div>
              </div>
              <div className="flex justify-between items-center text-xs mt-2">
                <span className="text-cyan-500/60 font-medium">❄️ Chill</span>
                <div className="flex items-center gap-4 text-gray-500">
                  <span>
                    Rate: <span className="text-gray-300 font-mono">{aggregation?.voteRate?.toFixed(2) || '0'}</span>/s
                  </span>
                  <span>
                    Avg: <span className="text-gray-300 font-mono">{aggregation?.avgRate?.toFixed(2) || '0'}</span>/s
                  </span>
                </div>
                <span className="text-orange-500/60 font-medium">🔥 Hype</span>
              </div>
            </Panel>

            {/* Agent History (recent decisions) */}
            {agentData.recentDecisions.length > 1 && (
              <Panel title="DECISION TIMELINE" accent="purple">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {agentData.recentDecisions.map((d, i) => (
                    <div key={i} className="flex-shrink-0 w-48 p-2 rounded-lg bg-white/[0.03] border border-white/5 text-xs">
                      <div className="text-gray-500 mb-1 text-[10px]">
                        {new Date(d.timestamp).toLocaleTimeString()}
                      </div>
                      <p className="text-gray-400 line-clamp-2 leading-relaxed">{d.reasoning}</p>
                      <div className="mt-1 flex gap-1 flex-wrap">
                        {d.actions.slice(0, 2).map((a, j) => (
                          <span key={j} className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 text-[9px]">
                            {a.type}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>

          {/* Right: Agent Log + Vote Feed */}
          <div className="col-span-12 lg:col-span-3 space-y-3">
            <Panel title="AI DJ BRAIN" accent="purple" className="max-h-[380px] overflow-y-auto">
              {decision ? (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded bg-purple-500/20 flex items-center justify-center text-[10px]">🧠</div>
                      <span className="text-[10px] font-bold tracking-[0.15em] text-gray-500 uppercase">Reasoning</span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {decision.reasoning}
                    </p>
                  </div>

                  <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold tracking-[0.15em] text-gray-500 uppercase">Actions</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300">
                        {(decision.confidence * 100).toFixed(0)}% conf
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {decision.actions.map((a, i) => (
                        <div
                          key={i}
                          className="text-sm py-2 px-3 rounded-lg bg-white/[0.03] border border-white/5 flex justify-between items-center"
                        >
                          <span className="text-purple-300 font-medium text-xs">{a.type}</span>
                          <span className="text-gray-500 text-[10px] font-mono max-w-[120px] truncate">
                            {typeof a.value === 'object'
                              ? JSON.stringify(a.value)
                              : String(a.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="text-2xl mb-2 opacity-30">🤖</div>
                  <p className="text-gray-600 text-xs">Agent not started</p>
                  <p className="text-gray-700 text-[10px] mt-1 font-mono">npm run agent</p>
                </div>
              )}
            </Panel>

            <Panel title="VOTE FEED" accent="cyan" className="max-h-[260px] overflow-y-auto">
              {recentVotes.length > 0 ? (
                <div className="space-y-0.5">
                  {[...recentVotes].reverse().map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-white/[0.02] transition-colors"
                    >
                      <span className="text-lg flex-shrink-0">
                        {VOTE_EMOJIS[v.voteType] || '•'}
                      </span>
                      <span className={`font-medium ${VOTE_COLORS[v.voteType] || 'text-gray-300'}`}>
                        {v.voteType.replace(/_/g, ' ')}
                      </span>
                      <span className="text-gray-700 text-[10px] ml-auto font-mono flex-shrink-0">
                        {new Date(v.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-600 text-xs">Waiting for votes...</p>
                  <p className="text-gray-700 text-[10px] mt-1">Share <span className="text-purple-400/50 font-mono">/vote</span> with audience</p>
                </div>
              )}
            </Panel>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-5 flex items-center justify-center gap-4">
          <div className="glass rounded-xl px-5 py-2.5 flex items-center gap-3">
            <span className="text-gray-500 text-xs">📱 Audience vote:</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 font-mono font-bold text-sm">/vote</span>
          </div>
          <div className="text-[10px] text-gray-700 tracking-wide">
            Powered by <span className="text-purple-500/40">Dedalus</span> · <span className="text-cyan-500/40">K2 Think</span> · <span className="text-pink-500/40">Flowglad</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
  className = '',
  accent = 'purple',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  accent?: 'purple' | 'cyan' | 'magenta';
}) {
  const accentColors = {
    purple: 'from-purple-500',
    cyan: 'from-cyan-500',
    magenta: 'from-pink-500',
  };
  return (
    <div className={`glass rounded-xl p-4 relative overflow-hidden ${className}`}>
      <div className={`absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r ${accentColors[accent]} to-transparent opacity-40`} />
      <h2 className="text-[10px] font-bold text-gray-500 tracking-[0.2em] mb-3 uppercase">{title}</h2>
      {children}
    </div>
  );
}

function ParamRow({ label, value, color = 'text-white', children }: { label: string; value?: string; color?: string; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
      <span className="text-gray-500 text-xs">{label}</span>
      {children || (
        <span className={`font-mono text-xs font-bold ${color}`}>{value}</span>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen text-white flex items-center justify-center">
        <div className="bg-scene" />
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
