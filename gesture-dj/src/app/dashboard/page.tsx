'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { VoteAggregation, Vote } from '@/lib/types';
import { Suspense } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface AgentDecision {
  reasoning: string;
  actions: Array<{ type: string; value: unknown }>;
  confidence: number;
  audioState: Record<string, unknown>;
  timestamp: number;
}

interface MusicQueueItem {
  id: string;
  prompt: string;
  genre: string;
  bpm: number;
  energy: number;
  mood: string;
  status: 'queued' | 'generating' | 'ready' | 'playing' | 'failed';
  createdAt: number;
  audioUrl?: string;
}

/* ── SVG Icons ── */

function IconBrain({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A5.5 5.5 0 0 0 4 7.5c0 1.5.5 2.8 1.4 3.8A5.5 5.5 0 0 0 4 15.5 5.5 5.5 0 0 0 9.5 21h.5" />
      <path d="M14.5 2A5.5 5.5 0 0 1 20 7.5c0 1.5-.5 2.8-1.4 3.8A5.5 5.5 0 0 1 20 15.5a5.5 5.5 0 0 1-5.5 5.5H14" />
      <path d="M12 2v19" />
    </svg>
  );
}

function IconMusic({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function IconCamera({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconCube({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function IconFlame({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c.5 2.5 2 4.5 2 7a4 4 0 1 1-8 0c0-2.5 2-4 3-6 1 2 2.5 3 3 5s1-3 0-6z" />
    </svg>
  );
}

function IconSnowflake({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
    </svg>
  );
}

const VOTE_ICONS: Record<string, { icon: string; color: string }> = {
  energy_up:    { icon: '▲', color: 'text-orange-400' },
  energy_down:  { icon: '▼', color: 'text-cyan-400' },
  drop_request: { icon: '⚡', color: 'text-yellow-400' },
  genre_switch: { icon: '◎', color: 'text-purple-400' },
  viz_style:    { icon: '✦', color: 'text-pink-400' },
  speed_up:     { icon: '»', color: 'text-emerald-400' },
  speed_down:   { icon: '«', color: 'text-blue-400' },
};

const QUEUE_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  queued:     { bg: 'bg-gray-500/10', text: 'text-gray-400', label: 'Queued' },
  generating: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Generating' },
  ready:      { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Ready' },
  playing:    { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Playing' },
  failed:     { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Failed' },
};

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionCode = searchParams.get('session');
  const [memberCount, setMemberCount] = useState(0);
  const [showQR, setShowQR] = useState(false);

  const [aggregation, setAggregation] = useState<VoteAggregation | null>(null);
  const [recentVotes, setRecentVotes] = useState<Vote[]>([]);
  const [musicQueue, setMusicQueue] = useState<{
    queue: MusicQueueItem[];
    queued: number;
    generating: number;
    ready: number;
    total: number;
  }>({ queue: [], queued: 0, generating: 0, ready: 0, total: 0 });
  const [agentData, setAgentData] = useState<{
    latestDecision: AgentDecision | null;
    recentDecisions: AgentDecision[];
    totalDecisions: number;
  }>({ latestDecision: null, recentDecisions: [], totalDecisions: 0 });

  // DJ Booth live state (from CV client via WS)
  const [djBoothState, setDjBoothState] = useState<{
    gesture: {
      fingerCount: number;
      handDetected: boolean;
      isPinching: boolean;
      volume: number;
      stemSelect: number;
      playPause: boolean;
      trackSwitch: boolean;
      isFist: boolean;
      isOpen: boolean;
      effectTrigger: number;
    } | null;
    audio: {
      trackFolder: string;
      trackIndex: number;
      selectedStem: number;
      stemVolumes: number[];
      isPlaying: boolean;
      isTrackLoading: boolean;
      volume: number;
      stemCount: number;
    } | null;
  } | null>(null);
  const [djBoothConnected, setDjBoothConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Audio player state
  const [nowPlaying, setNowPlaying] = useState<MusicQueueItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-play next ready track
  const playTrack = useCallback(async (item: MusicQueueItem) => {
    if (!item.audioUrl) return;
    setNowPlaying(item);
    setIsPlaying(true);
    // Mark as playing
    try {
      await fetch('/api/music-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status: 'playing' }),
      });
    } catch { /* non-fatal */ }
  }, []);

  // Check for next ready track when queue updates
  useEffect(() => {
    if (!isPlaying && musicQueue.ready > 0) {
      const nextReady = musicQueue.queue.find((i) => i.status === 'ready' && i.audioUrl);
      if (nextReady) playTrack(nextReady);
    }
  }, [musicQueue, isPlaying, playTrack]);

  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false);
    setNowPlaying(null);
  }, []);

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
    handleSignOut();
  };

  // Poll votes
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/vote${sessionCode ? `?session=${sessionCode}` : ''}`);
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

  // Poll music queue
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/music-queue');
        if (res.ok) {
          const data = await res.json();
          setMusicQueue(data);
        }
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket connection to receive CV data from DJ Booth
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        ws = new WebSocket('ws://localhost:8080?type=dashboard');
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[Dashboard WS] Connected');
        };

        let staleTimer: ReturnType<typeof setTimeout> | null = null;

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.source === 'cv' && msg.type === 'gesture_update' && msg.data) {
              setDjBoothState(msg.data);
              setDjBoothConnected(true);
              if (staleTimer) clearTimeout(staleTimer);
              staleTimer = setTimeout(() => setDjBoothConnected(false), 3000);
            }
          } catch { /* ignore parse errors */ }
        };

        ws.onclose = () => {
          console.log('[Dashboard WS] Disconnected');
          setDjBoothConnected(false);
          reconnectTimer = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          setDjBoothConnected(false);
        };
      } catch {
        reconnectTimer = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  const decision = agentData.latestDecision;
  const audioState = decision?.audioState;
  const energyPercent = ((aggregation?.energyBias ?? 0) + 1) / 2 * 100;
  const energyValue = Number(audioState?.energy || 0.5);

  const [voteUrl, setVoteUrl] = useState('');
  useEffect(() => {
    setVoteUrl(`${window.location.origin}/vote${sessionCode ? `?session=${sessionCode}` : ''}`);
  }, [sessionCode]);

  return (
    <div className="min-h-screen text-white relative">
      <div className="bg-scene" />
      <div className="bg-grid" />

      {/* QR Code Modal */}
      {showQR && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowQR(false)}
        >
          <div
            className="glass-strong rounded-3xl p-8 flex flex-col items-center gap-5 max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <h2 className="text-xl font-black tracking-tight mb-1">Join the Session</h2>
              <p className="text-gray-400 text-sm">Scan to vote and shape the music</p>
            </div>
            <div className="bg-white rounded-2xl p-4">
              <QRCodeSVG
                value={voteUrl}
                size={220}
                level="M"
                bgColor="#ffffff"
                fgColor="#0a0a1a"
              />
            </div>
            {sessionCode && (
              <div className="text-center">
                <div className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-1">Session Code</div>
                <div className="font-mono text-3xl font-black tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                  {sessionCode}
                </div>
              </div>
            )}
            <div className="text-[10px] text-gray-600 font-mono">{voteUrl}</div>
            <button
              onClick={() => setShowQR(false)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 p-4 lg:p-5 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl lg:text-3xl font-black tracking-tight">
              GESTURE{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400">
                DJ
              </span>
            </h1>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full glass text-xs">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-red-500 animate-ping" />
              </div>
              <span className="text-red-400 font-bold tracking-wider">LIVE</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {sessionCode && (
              <button
                onClick={() => setShowQR(true)}
                className="glass rounded-lg px-3 py-1.5 flex items-center gap-2 hover:bg-white/[0.04] transition-colors cursor-pointer group"
              >
                <svg className="w-4 h-4 text-purple-400 group-hover:text-purple-300 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="3" height="3" />
                  <rect x="18" y="18" width="3" height="3" />
                  <rect x="18" y="14" width="3" height="1" />
                  <rect x="14" y="18" width="1" height="3" />
                </svg>
                <span className="font-mono font-bold text-lg tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                  {sessionCode}
                </span>
                <span className="text-gray-600 text-xs">{memberCount} joined</span>
              </button>
            )}
            {aggregation?.isHypeSpike && (
              <div className="relative">
                <div className="absolute inset-0 bg-orange-500/20 rounded-full blur-md animate-pulse" />
                <span className="relative px-3 py-1.5 bg-gradient-to-r from-orange-500/15 to-red-500/15 border border-orange-500/30 text-orange-300 rounded-full font-bold text-xs tracking-wider">
                  HYPE SPIKE
                </span>
              </div>
            )}
            <div className="glass rounded-lg px-3 py-1.5 flex items-center gap-2">
              <IconBrain className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-bold text-purple-300">{agentData.totalDecisions}</span>
            </div>
            <button
              onClick={handleEndSession}
              className="glass rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:text-red-400 hover:border-red-500/30 transition-colors cursor-pointer"
            >
              End
            </button>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-3 lg:gap-4 flex-1">
          {/* ── Left Column ── */}
          <div className="col-span-12 lg:col-span-3 space-y-3 flex flex-col">
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
                      const meta = VOTE_ICONS[type] || { icon: '•', color: 'text-white' };
                      return (
                        <div key={type}>
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="text-xs text-gray-400 flex items-center gap-1.5">
                              <span className={`text-[10px] ${meta.color}`}>{meta.icon}</span>
                              {type.replace(/_/g, ' ')}
                            </span>
                            <span className={`font-bold text-xs ${meta.color}`}>{count}</span>
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
                <div className="text-center py-3">
                  <p className="text-gray-600 text-xs">Waiting for votes...</p>
                </div>
              )}
            </Panel>

            {/* QR Code Mini */}
            {sessionCode && (
              <Panel title="AUDIENCE JOIN" accent="magenta" className="mt-auto">
                <button
                  onClick={() => setShowQR(true)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer group"
                >
                  <div className="bg-white rounded-lg p-1.5 flex-shrink-0">
                    <QRCodeSVG
                      value={voteUrl}
                      size={52}
                      level="L"
                      bgColor="#ffffff"
                      fgColor="#0a0a1a"
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-[10px] text-gray-500 mb-0.5">Scan or tap to enlarge</div>
                    <div className="font-mono text-sm font-bold tracking-[0.15em] text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                      {sessionCode}
                    </div>
                    <div className="text-[10px] text-gray-600 truncate">{voteUrl}</div>
                  </div>
                </button>
              </Panel>
            )}
          </div>

          {/* ── Center Column ── */}
          <div className="col-span-12 lg:col-span-6 space-y-3 flex flex-col">
            <div className="grid grid-cols-2 gap-3">
              <div className="min-h-[140px] lg:min-h-[160px] glass rounded-xl flex flex-col relative overflow-hidden group p-3">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-transparent" />
                <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/30 text-[9px] font-medium z-20">
                  <div className={`w-1.5 h-1.5 rounded-full ${djBoothConnected ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                  <span className={djBoothConnected ? 'text-emerald-400' : 'text-gray-500'}>
                    {djBoothConnected ? 'DJ Booth Live' : 'Stream A'}
                  </span>
                </div>
                {djBoothConnected && djBoothState ? (
                  <div className="relative z-10 flex flex-col justify-between h-full pt-5">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">Track</span>
                        <span className="text-xs font-mono font-bold text-purple-300">
                          {djBoothState.audio?.trackFolder?.toUpperCase() || '--'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">Stem</span>
                        <span className="text-xs font-mono font-bold text-cyan-300">
                          {djBoothState.audio?.selectedStem != null && djBoothState.audio.selectedStem >= 0
                            ? djBoothState.audio.selectedStem + 1
                            : '--'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">Status</span>
                        <span className={`text-xs font-bold ${djBoothState.audio?.isPlaying ? 'text-emerald-400' : 'text-gray-500'}`}>
                          {djBoothState.audio?.isPlaying ? 'PLAYING' : 'PAUSED'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">Gesture</span>
                        <span className="text-xs font-mono font-bold text-orange-300">
                          {djBoothState.gesture?.handDetected
                            ? djBoothState.gesture.isPinching
                              ? 'PINCH'
                              : djBoothState.gesture.isOpen
                                ? 'OPEN'
                                : djBoothState.gesture.isFist
                                  ? 'FIST'
                                  : `${djBoothState.gesture.fingerCount}F`
                            : 'NO HAND'}
                        </span>
                      </div>
                      {djBoothState.audio?.stemVolumes && (
                        <div className="flex gap-1 mt-1">
                          {djBoothState.audio.stemVolumes.map((vol: number, i: number) => (
                            <div key={i} className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-200 ${
                                  djBoothState.audio?.selectedStem === i
                                    ? 'bg-gradient-to-r from-purple-400 to-cyan-400'
                                    : 'bg-white/20'
                                }`}
                                style={{ width: `${Math.round(vol * 100)}%` }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative z-10 flex flex-col items-center justify-center h-full gap-2">
                    <IconCamera className="w-7 h-7 text-gray-600" />
                    <button
                      onClick={() => window.open('http://localhost:8000', 'dj-booth', 'width=1280,height=800')}
                      className="px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[10px] font-bold tracking-wider hover:bg-purple-500/25 transition-colors cursor-pointer"
                    >
                      LAUNCH DJ BOOTH
                    </button>
                    <span className="text-gray-600 text-[9px]">Opens in new window</span>
                  </div>
                )}
              </div>
              <div className="min-h-[140px] lg:min-h-[160px] glass rounded-xl flex items-center justify-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/5 to-transparent" />
                <div className="relative z-10 text-center">
                  <IconCube className="w-8 h-8 text-gray-600 mx-auto mb-2" />
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
                    background: energyPercent > 60
                      ? 'linear-gradient(90deg, #a855f7, #ec4899 50%, #f97316)'
                      : energyPercent < 40
                        ? 'linear-gradient(90deg, #06b6d4, #3b82f6)'
                        : 'linear-gradient(90deg, #06b6d4, #a855f7 40%, #ec4899 70%, #f97316)',
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full" />
                </div>
              </div>
              <div className="flex justify-between items-center text-xs mt-2">
                <span className="text-cyan-500/60 font-medium flex items-center gap-1">
                  <IconSnowflake className="w-3 h-3" /> Chill
                </span>
                <div className="flex items-center gap-4 text-gray-500">
                  <span>
                    Rate: <span className="text-gray-300 font-mono">{aggregation?.voteRate?.toFixed(2) || '0'}</span>/s
                  </span>
                  <span>
                    Avg: <span className="text-gray-300 font-mono">{aggregation?.avgRate?.toFixed(2) || '0'}</span>/s
                  </span>
                </div>
                <span className="text-orange-500/60 font-medium flex items-center gap-1">
                  Hype <IconFlame className="w-3 h-3" />
                </span>
              </div>
            </Panel>

            {/* Now Playing */}
            {nowPlaying && (
              <Panel title="NOW PLAYING" accent="magenta">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/10 flex items-center justify-center">
                      <IconMusic className="w-5 h-5 text-purple-400" />
                    </div>
                    {isPlaying && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0a0a1a] animate-pulse" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white/90">{nowPlaying.genre}</span>
                      <span className="text-gray-600 text-[10px] font-mono">{nowPlaying.bpm}bpm</span>
                    </div>
                    <p className="text-[10px] text-gray-500 truncate">{nowPlaying.prompt.slice(0, 60)}...</p>
                  </div>
                  <button
                    onClick={() => {
                      if (audioRef.current) {
                        if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
                        else { audioRef.current.play(); setIsPlaying(true); }
                      }
                    }}
                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    {isPlaying ? (
                      <svg className="w-3.5 h-3.5 text-white/70" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-white/70" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    )}
                  </button>
                </div>
                {nowPlaying.audioUrl && (
                  <audio
                    ref={audioRef}
                    src={nowPlaying.audioUrl}
                    autoPlay
                    onEnded={handleAudioEnded}
                    onError={() => { setIsPlaying(false); setNowPlaying(null); }}
                    className="hidden"
                  />
                )}
              </Panel>
            )}

            {/* Music Generation Queue */}
            <Panel title="MUSIC QUEUE" accent="cyan">
              {musicQueue.total > 0 ? (
                <div className="space-y-2">
                  {/* Status summary */}
                  <div className="flex items-center gap-3 text-[10px] mb-2">
                    {musicQueue.queued > 0 && (
                      <span className="flex items-center gap-1 text-gray-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        {musicQueue.queued} queued
                      </span>
                    )}
                    {musicQueue.generating > 0 && (
                      <span className="flex items-center gap-1 text-amber-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        {musicQueue.generating} generating
                      </span>
                    )}
                    {musicQueue.ready > 0 && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {musicQueue.ready} ready
                      </span>
                    )}
                  </div>
                  {/* Queue items */}
                  {musicQueue.queue.slice(-5).reverse().map((item) => {
                    const statusStyle = QUEUE_STATUS_STYLES[item.status] || QUEUE_STATUS_STYLES.queued;
                    return (
                      <div key={item.id} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <IconMusic className="w-3.5 h-3.5 text-cyan-400/60" />
                            <span className="text-xs font-medium text-gray-300">{item.genre}</span>
                            <span className="text-gray-600 text-[10px] font-mono">{item.bpm}bpm</span>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${statusStyle.bg} ${statusStyle.text}`}>
                            {statusStyle.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">
                          {item.prompt.length > 100 ? item.prompt.slice(0, 100) + '...' : item.prompt}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-3">
                  <IconMusic className="w-6 h-6 text-gray-700 mx-auto mb-1.5" />
                  <p className="text-gray-600 text-xs">No tracks queued yet</p>
                  <p className="text-gray-700 text-[10px] mt-0.5">Agent will queue tracks automatically</p>
                </div>
              )}
            </Panel>

            {/* Decision Timeline */}
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

          {/* ── Right Column ── */}
          <div className="col-span-12 lg:col-span-3 space-y-3 flex flex-col">
            <Panel title="AI DJ BRAIN" accent="purple" className="flex-1 max-h-[40vh] overflow-y-auto">
              {decision ? (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded bg-purple-500/20 flex items-center justify-center">
                        <IconBrain className="w-3 h-3 text-purple-400" />
                      </div>
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
                  <IconBrain className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-600 text-xs">Agent not started</p>
                  <p className="text-gray-700 text-[10px] mt-1 font-mono">npm run agent</p>
                </div>
              )}
            </Panel>

            <Panel title="VOTE FEED" accent="cyan" className="flex-1 max-h-[25vh] overflow-y-auto">
              {recentVotes.length > 0 ? (
                <div className="space-y-0.5">
                  {[...recentVotes].reverse().map((v) => {
                    const meta = VOTE_ICONS[v.voteType] || { icon: '•', color: 'text-gray-300' };
                    return (
                      <div
                        key={v.id}
                        className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-white/[0.02] transition-colors"
                      >
                        <span className={`text-sm font-bold flex-shrink-0 ${meta.color}`}>
                          {meta.icon}
                        </span>
                        <span className={`font-medium ${meta.color}`}>
                          {v.voteType.replace(/_/g, ' ')}
                        </span>
                        <span className="text-gray-700 text-[10px] ml-auto font-mono flex-shrink-0">
                          {new Date(v.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-600 text-xs">Waiting for votes...</p>
                  <p className="text-gray-700 text-[10px] mt-1">Share the QR code with the audience</p>
                </div>
              )}
            </Panel>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-2 flex items-center justify-center gap-4 py-1.5 shrink-0">
          <button
            onClick={() => sessionCode && setShowQR(true)}
            className="glass rounded-xl px-5 py-2.5 flex items-center gap-3 hover:bg-white/[0.03] transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="3" height="3" />
              <rect x="18" y="18" width="3" height="3" />
            </svg>
            <span className="text-gray-400 text-xs">Show QR</span>
          </button>
          <div className="text-[10px] text-gray-700 tracking-wide">
            <span className="text-purple-500/40">Dedalus</span> · <span className="text-cyan-500/40">K2 Think</span> · <span className="text-pink-500/40">Flowglad</span>
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
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin w-6 h-6 text-purple-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-gray-500 text-sm">Loading dashboard...</span>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
