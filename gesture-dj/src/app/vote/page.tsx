'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useBilling, usePricing } from '@flowglad/nextjs';
import { VoteType, VoteAggregation } from '@/lib/types';

const VOTE_PACKS = [
  { slug: 'dj_vote_credits', name: 'Starter', votes: 50, price: '$1.99', gradient: 'from-purple-600 to-indigo-600' },
] as const;

const FEATURE_SLUG = '50_vote_credits';
const USAGE_METER_SLUG = 'vote_credits';

/* ── SVG Icon Components ── */

function IconFlame({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c.5 2.5 2 4.5 2 7a4 4 0 1 1-8 0c0-2.5 2-4 3-6 1 2 2.5 3 3 5s1-3 0-6z" fill="currentColor" fillOpacity="0.15" />
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
      <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.1" />
    </svg>
  );
}

function IconZap({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" fillOpacity="0.15" />
    </svg>
  );
}

function IconDisc({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.2" />
      <path d="M12 9a3 3 0 0 0 0 6" />
    </svg>
  );
}

function IconChevronUp({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 15 12 9 18 15" />
      <polyline points="6 20 12 14 18 20" opacity="0.4" />
    </svg>
  );
}

function IconChevronDown({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
      <polyline points="6 4 12 10 18 4" opacity="0.4" />
    </svg>
  );
}

function IconSparkles({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" fill="currentColor" fillOpacity="0.15" />
      <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z" fill="currentColor" fillOpacity="0.1" />
      <path d="M5 17l.6 1.4L7 19l-1.4.6L5 21l-.6-1.4L3 19l1.4-.6L5 17z" fill="currentColor" fillOpacity="0.1" />
    </svg>
  );
}

function EqVisualizer() {
  return (
    <div className="flex items-end gap-[3px] h-5">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="eq-bar w-[3px] bg-gradient-to-t from-purple-500 to-cyan-400 opacity-70" />
      ))}
    </div>
  );
}

function Spinner({ size = 'w-5 h-5' }: { size?: string }) {
  return (
    <svg className={`animate-spin ${size} text-white/50`} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

interface VoteButtonConfig {
  type: VoteType;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  subLabel: string;
  value?: string;
  gradient: string;
  borderGlow: string;
  glowColor: string;
  iconColor: string;
  activeRing: string;
}

/* Hero button — the star of the show */
const DROP_BUTTON: VoteButtonConfig = {
  type: 'drop_request',
  Icon: IconZap,
  label: 'DROP',
  subLabel: 'Build & drop',
  gradient: 'from-yellow-500/40 via-amber-500/25 to-transparent',
  borderGlow: 'border-yellow-500/25 hover:border-yellow-400/50',
  glowColor: 'rgba(234,179,8,0.45)',
  iconColor: 'text-yellow-400',
  activeRing: 'ring-yellow-400/70',
};

/* Semantic pairs */
const ENERGY_PAIR: VoteButtonConfig[] = [
  {
    type: 'energy_up',
    Icon: IconFlame,
    label: 'HYPE',
    subLabel: 'Energy up',
    gradient: 'from-orange-500/30 via-red-500/20 to-transparent',
    borderGlow: 'border-orange-500/20 hover:border-orange-400/40',
    glowColor: 'rgba(249,115,22,0.35)',
    iconColor: 'text-orange-400',
    activeRing: 'ring-orange-400/60',
  },
  {
    type: 'energy_down',
    Icon: IconSnowflake,
    label: 'CHILL',
    subLabel: 'Cool down',
    gradient: 'from-cyan-500/30 via-blue-500/20 to-transparent',
    borderGlow: 'border-cyan-500/20 hover:border-cyan-400/40',
    glowColor: 'rgba(6,182,212,0.35)',
    iconColor: 'text-cyan-400',
    activeRing: 'ring-cyan-400/60',
  },
];

const SPEED_PAIR: VoteButtonConfig[] = [
  {
    type: 'speed_up',
    Icon: IconChevronUp,
    label: 'FASTER',
    subLabel: 'BPM up',
    gradient: 'from-emerald-500/30 via-green-500/20 to-transparent',
    borderGlow: 'border-emerald-500/20 hover:border-emerald-400/40',
    glowColor: 'rgba(16,185,129,0.35)',
    iconColor: 'text-emerald-400',
    activeRing: 'ring-emerald-400/60',
  },
  {
    type: 'speed_down',
    Icon: IconChevronDown,
    label: 'SLOWER',
    subLabel: 'BPM down',
    gradient: 'from-blue-500/30 via-indigo-500/20 to-transparent',
    borderGlow: 'border-blue-500/20 hover:border-blue-400/40',
    glowColor: 'rgba(59,130,246,0.35)',
    iconColor: 'text-blue-400',
    activeRing: 'ring-blue-400/60',
  },
];

const STYLE_PAIR: VoteButtonConfig[] = [
  {
    type: 'genre_switch',
    Icon: IconDisc,
    label: 'GENRE',
    subLabel: 'Switch it up',
    gradient: 'from-purple-500/30 via-fuchsia-500/20 to-transparent',
    borderGlow: 'border-purple-500/20 hover:border-purple-400/40',
    glowColor: 'rgba(168,85,247,0.35)',
    iconColor: 'text-purple-400',
    activeRing: 'ring-purple-400/60',
  },
  {
    type: 'viz_style',
    Icon: IconSparkles,
    label: 'VISUALS',
    subLabel: 'New look',
    gradient: 'from-pink-500/30 via-rose-500/20 to-transparent',
    borderGlow: 'border-pink-500/20 hover:border-pink-400/40',
    glowColor: 'rgba(236,72,153,0.35)',
    iconColor: 'text-pink-400',
    activeRing: 'ring-pink-400/60',
  },
];


function VoteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionCode = searchParams.get('session');

  const [userId, setUserId] = useState('anon');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const pricingModel = usePricing();
  const billing = useBilling();

  // Flowglad billing helpers
  const billingLoaded = billing?.loaded ?? false;
  const createCheckoutSession = billing?.createCheckoutSession;
  const checkFeatureAccess = billing?.checkFeatureAccess;
  const checkUsageBalance = billing?.checkUsageBalance;
  const createUsageEvent = billing?.createUsageEvent;
  const billingReload = billing?.reload;

  // Check feature access & remaining credits
  const hasFeature = billingLoaded && checkFeatureAccess ? checkFeatureAccess(FEATURE_SLUG) : false;
  const usageBalance = billingLoaded && checkUsageBalance ? checkUsageBalance(USAGE_METER_SLUG) : null;
  const creditsRemaining = usageBalance?.availableBalance ?? null;
  const hasPurchased = billing?.purchases && billing.purchases.length > 0;

  // User has vote access if: Flowglad says they have the feature, OR they have credits, OR they've made a purchase
  const hasVoteAccess = hasFeature || (creditsRemaining !== null && creditsRemaining > 0) || !!hasPurchased;

  // After checkout redirect, reload billing data from Flowglad
  const purchased = searchParams.get('purchased');
  useEffect(() => {
    if (purchased === 'true' && billingReload) {
      console.log('[vote] Post-purchase redirect — reloading billing data');
      billingReload();
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('purchased');
      window.history.replaceState({}, '', url.toString());
    }
  }, [purchased, billingReload]);

  const [lastVote, setLastVote] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [aggregation, setAggregation] = useState<Partial<VoteAggregation>>({});
  const [voteCount, setVoteCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [flashVote, setFlashVote] = useState<string | null>(null);
  const [bgEffect, setBgEffect] = useState<string | null>(null);
  const bgEffectKey = useRef(0);
  const prevCountRef = useRef(0);

  // Map vote types to background burst CSS classes
  const VOTE_BG_MAP: Record<string, string> = {
    energy_up: 'vote-bg-hype',
    energy_down: 'vote-bg-chill',
    drop_request: 'vote-bg-drop',
    genre_switch: 'vote-bg-genre',
    speed_up: 'vote-bg-speed',
    viz_style: 'vote-bg-visuals',
  };

  // Poll for aggregation updates
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/vote');
        if (res.ok) {
          const data = await res.json();
          setAggregation(data.aggregation);
        }
      } catch {
        // Silently ignore poll errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const [buyingSlug, setBuyingSlug] = useState<string | null>(null);

  const handleBuyVotes = useCallback(async (slug: string) => {
    if (!createCheckoutSession) return;
    setCheckoutLoading(true);
    setBuyingSlug(slug);
    try {
      // Find the product's price slug in the pricing model
      let priceSlug = slug;
      if (pricingModel?.products) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const product = pricingModel.products.find((p: any) => p.slug === slug);
        if (product) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const price = (product as any)?.defaultPrice ?? (product as any)?.prices?.[0];
          if (price?.slug) {
            priceSlug = price.slug;
          }
        }
      }
      const sessionParam = sessionCode ? `&session=${sessionCode}` : '';
      await createCheckoutSession({
        priceSlug,
        successUrl: `${window.location.origin}/vote?purchased=true${sessionParam}`,
        cancelUrl: window.location.href,
        autoRedirect: true,
      });
    } catch (err) {
      console.error('Checkout error:', err);
      setError('Failed to start checkout — try again');
    } finally {
      setCheckoutLoading(false);
      setBuyingSlug(null);
    }
  }, [createCheckoutSession, pricingModel, sessionCode]);

  const castVote = useCallback(
    async (voteType: VoteType, voteValue?: string) => {
      if (cooldown) return;

      setCooldown(true);
      setError(null);
      setLastVote(voteType);

      // Haptic feedback on mobile
      if (navigator.vibrate) navigator.vibrate(30);
      setFlashVote(voteType);
      setTimeout(() => setFlashVote(null), 400);

      // Trigger reactive background burst
      bgEffectKey.current += 1;
      setBgEffect(voteType);
      setTimeout(() => setBgEffect(null), 1800);

      try {
        const res = await fetch('/api/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, voteType, voteValue }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (res.status === 402) {
            setError('No vote credits remaining — buy more below!');
            if (billingReload) billingReload();
          } else {
            setError(data.error || 'Vote failed');
          }
          return;
        }

        prevCountRef.current = voteCount;
        setVoteCount((c) => c + 1);
        setAggregation(data.aggregation);

        // Track usage with Flowglad — decrement 1 credit per vote
        if (createUsageEvent) {
          const result = await createUsageEvent({
            usageMeterSlug: USAGE_METER_SLUG,
            amount: 1,
          });
          if ('error' in result) {
            console.warn('[vote] Usage event error:', result.error);
          }
          // Refresh billing to update credits remaining
          if (billingReload) billingReload();
        }
      } catch {
        setError('Network error — try again');
      } finally {
        // 1-second cooldown between votes
        setTimeout(() => {
          setCooldown(false);
          setLastVote(null);
        }, 1000);
      }
    },
    [userId, cooldown, voteCount, createUsageEvent, billingReload]
  );

  const energyPercent = aggregation.energyBias !== undefined
    ? ((aggregation.energyBias + 1) / 2) * 100
    : 50;

  const energyLabel = energyPercent > 70 ? 'High Energy' : energyPercent < 30 ? 'Chill Zone' : 'Balanced';

  return (
    <div className="min-h-[100dvh] text-white flex flex-col relative overflow-hidden">
      {/* Animated background */}
      <div className="bg-scene" />
      <div className="bg-grid" />

      {/* Ambient floating orbs — colors shift with energy bias */}
      <div className="floating-orb orb-1" style={{
        background: energyPercent > 60
          ? 'rgba(249,115,22,0.15)'
          : energyPercent < 40
            ? 'rgba(6,182,212,0.15)'
            : 'rgba(168,85,247,0.12)',
        transition: 'background 3s ease',
      }} />
      <div className="floating-orb orb-2" style={{
        background: energyPercent > 60
          ? 'rgba(239,68,68,0.12)'
          : energyPercent < 40
            ? 'rgba(59,130,246,0.12)'
            : 'rgba(236,72,153,0.10)',
        transition: 'background 3s ease',
      }} />
      <div className="floating-orb orb-3" style={{
        background: energyPercent > 60
          ? 'rgba(234,179,8,0.08)'
          : energyPercent < 40
            ? 'rgba(139,92,246,0.08)'
            : 'rgba(6,182,212,0.06)',
        transition: 'background 3s ease',
      }} />

      {/* Ambient energy tint overlay */}
      <div className="bg-energy-overlay" style={{
        background: energyPercent > 70
          ? 'radial-gradient(ellipse at 50% 100%, rgba(249,115,22,0.06) 0%, transparent 60%)'
          : energyPercent < 30
            ? 'radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.06) 0%, transparent 60%)'
            : 'none',
        opacity: Math.abs(energyPercent - 50) / 50,
      }} />

      {/* Vote-reactive background burst */}
      {bgEffect && (
        <div key={bgEffectKey.current} className={`vote-bg-burst ${VOTE_BG_MAP[bgEffect] || ''}`} />
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-[100dvh]">

        {/* ── Header ── */}
        <header className="pt-3 pb-1 px-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <div className="relative flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <div className="absolute w-2 h-2 rounded-full bg-red-500 animate-ping" />
                </div>
                <span className="text-[10px] font-semibold tracking-[0.25em] text-red-400/90 uppercase">Live Session</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight leading-none">
                GESTURE{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 text-shimmer text-glow-purple">
                  DJ
                </span>
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <EqVisualizer />
              {sessionCode && (
                <div className="glass-card rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="font-mono text-[11px] font-bold tracking-[0.15em] text-white/70">
                    {sessionCode}
                  </span>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Stats Row ── */}
        <div className="px-5 mt-2 mb-3">
          <div className="glass-card rounded-2xl px-4 py-3 flex items-center justify-between">
            {/* Votes cast */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <div className="text-[10px] font-medium tracking-wider text-gray-500 uppercase">Sent</div>
                <div className="text-xl font-black leading-none text-white/90 tabular-nums">{voteCount}</div>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-8 bg-white/5" />

            {/* Credits */}
            {creditsRemaining !== null && (
              <>
                <div className="text-center">
                  <div className="text-[10px] font-medium tracking-wider text-gray-500 uppercase">Credits</div>
                  <div className={`text-xl font-black leading-none tabular-nums ${
                    creditsRemaining <= 5 ? 'text-red-400' : creditsRemaining <= 15 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {creditsRemaining}
                  </div>
                </div>
                <div className="w-px h-8 bg-white/5" />
              </>
            )}

            {/* Active votes + hype */}
            <div className="flex items-center gap-2">
              {aggregation.isHypeSpike && (
                <div className="relative">
                  <div className="absolute inset-0 bg-orange-500/30 rounded-lg blur-md animate-pulse" />
                  <div className="relative px-2 py-1 bg-gradient-to-r from-orange-500/30 to-red-500/30 border border-orange-400/30 rounded-lg">
                    <span className="text-[9px] font-black tracking-[0.15em] text-orange-300 uppercase">Hype</span>
                  </div>
                </div>
              )}
              <div className="text-right">
                <div className="text-[10px] font-medium tracking-wider text-gray-500 uppercase">Active</div>
                <div className="text-xl font-black leading-none text-cyan-400 tabular-nums">{aggregation.total || 0}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Main Content Area ── */}
        <div className="flex-1 px-5 flex flex-col justify-center">
          {!billingLoaded ? (
            /* Loading state */
            <div className="max-w-sm mx-auto text-center py-12">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-purple-500/10 border border-purple-500/10 flex items-center justify-center">
                <Spinner size="w-6 h-6" />
              </div>
              <p className="text-gray-400 text-sm font-medium">Connecting to billing...</p>
              {billing?.errors && billing.errors.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-red-400/80 text-xs">{billing.errors[0]?.message || 'Billing error'}</p>
                  <button onClick={() => billingReload?.()} className="text-xs text-purple-400 hover:text-purple-300 underline cursor-pointer transition-colors">Retry</button>
                </div>
              )}
            </div>
          ) : !hasVoteAccess ? (
            /* Purchase credits view */
            <div className="max-w-sm mx-auto text-center space-y-6 py-6">
              <div>
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                    <line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                </div>
                <h2 className="text-xl font-black tracking-tight mb-1.5">Get Vote Credits</h2>
                <p className="text-gray-400/80 text-sm leading-relaxed max-w-[260px] mx-auto">
                  Shape the DJ set in real time. Control energy, request drops, and influence the vibe.
                </p>
              </div>
              <div className="space-y-3">
                {VOTE_PACKS.map((pack) => {
                  const isLoading = checkoutLoading && buyingSlug === pack.slug;
                  return (
                    <button
                      key={pack.slug}
                      onClick={() => handleBuyVotes(pack.slug)}
                      disabled={checkoutLoading}
                      className="w-full rounded-2xl glass-card vote-btn-shine vote-btn-press relative overflow-hidden group cursor-pointer"
                    >
                      <div className={`absolute inset-0 bg-gradient-to-r ${pack.gradient} opacity-20 group-hover:opacity-30 transition-opacity`} />
                      <div className="relative z-10 flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/10 flex items-center justify-center">
                            <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                              <line x1="7" y1="7" x2="7.01" y2="7"/>
                            </svg>
                          </div>
                          <div className="text-left">
                            <div className="font-bold text-sm text-white/90">{pack.name}</div>
                            <div className="text-gray-500 text-xs">{pack.votes} votes</div>
                          </div>
                        </div>
                        <div className="text-right">
                          {isLoading ? (
                            <Spinner />
                          ) : (
                            <span className="font-black text-lg text-white/90">{pack.price}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ── Vote Buttons — Hero + Semantic Pairs ── */
            <div className="max-w-sm mx-auto w-full space-y-3">

              {/* ⚡ Hero DROP button — full width, prominent */}
              {(() => {
                const btn = DROP_BUTTON;
                const isActive = lastVote === btn.type;
                const isFlash = flashVote === btn.type;
                const count = aggregation.counts?.[btn.type] || 0;
                return (
                  <button
                    key={btn.type}
                    onClick={() => castVote(btn.type, btn.value)}
                    disabled={cooldown}
                    aria-label={btn.subLabel}
                    className={`
                      relative w-full rounded-2xl vote-btn-shine vote-btn-press overflow-hidden
                      border backdrop-blur-xl transition-all duration-200 cursor-pointer
                      disabled:opacity-30 disabled:scale-100 group
                      ${btn.borderGlow}
                      ${isActive ? `ring-2 ${btn.activeRing}` : ''}
                    `}
                    style={{
                      background: 'rgba(12, 12, 25, 0.55)',
                      boxShadow: isActive
                        ? `0 0 30px ${btn.glowColor}, 0 0 80px ${btn.glowColor}, inset 0 1px 0 rgba(255,255,255,0.08)`
                        : '0 0 15px rgba(234,179,8,0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
                      ['--glow' as string]: btn.glowColor,
                    }}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-r ${btn.gradient} opacity-90 transition-opacity duration-200 group-hover:opacity-100`} />
                    {isFlash && <div className="absolute inset-0 bg-white/10 animate-pulse rounded-2xl pointer-events-none" />}
                    <div className="relative z-10 py-4 px-4 flex items-center gap-4">
                      <div className={`
                        w-14 h-14 rounded-xl border flex items-center justify-center shrink-0
                        transition-all duration-200
                        ${isActive ? 'scale-110 border-white/15' : 'group-hover:scale-105 border-white/5'}
                      `} style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <btn.Icon className={`w-7 h-7 ${btn.iconColor} transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
                      </div>
                      <div className="text-left flex-1">
                        <div className="font-black text-lg tracking-[0.12em] text-white/95 leading-none">{btn.label}</div>
                        <div className="text-xs text-white/35 mt-1 font-medium">{btn.subLabel}</div>
                      </div>
                      {count > 0 && (
                        <div className="min-w-[28px] h-[28px] rounded-full flex items-center justify-center text-[11px] font-bold text-white/80 px-2 animate-pop"
                          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)' }}>
                          {count}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })()}

              {/* ── Energy Row: HYPE / CHILL ── */}
              <div>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-orange-500/15 to-cyan-500/15" />
                  <span className="text-[9px] font-bold tracking-[0.25em] text-white/20 uppercase">Energy</span>
                  <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/15 via-orange-500/15 to-transparent" />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {ENERGY_PAIR.map((btn) => {
                    const isActive = lastVote === btn.type;
                    const isFlash = flashVote === btn.type;
                    const count = aggregation.counts?.[btn.type] || 0;
                    return (
                      <button key={btn.type} onClick={() => castVote(btn.type, btn.value)} disabled={cooldown} aria-label={btn.subLabel}
                        className={`relative rounded-2xl vote-btn-shine vote-btn-press overflow-hidden border backdrop-blur-xl transition-all duration-200 cursor-pointer disabled:opacity-30 disabled:scale-100 group ${btn.borderGlow} ${isActive ? `ring-2 ${btn.activeRing}` : ''}`}
                        style={{ background: 'rgba(12, 12, 25, 0.55)', boxShadow: isActive ? `0 0 25px ${btn.glowColor}, 0 0 60px ${btn.glowColor}, inset 0 1px 0 rgba(255,255,255,0.06)` : 'inset 0 1px 0 rgba(255,255,255,0.04)', ['--glow' as string]: btn.glowColor }}>
                        <div className={`absolute inset-0 bg-gradient-to-br ${btn.gradient} opacity-80 transition-opacity duration-200 group-hover:opacity-100`} />
                        {isFlash && <div className="absolute inset-0 bg-white/10 animate-pulse rounded-2xl pointer-events-none" />}
                        <div className="relative z-10 py-4 px-3 flex flex-col items-center gap-2">
                          <div className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-all duration-200 ${isActive ? 'scale-110 border-white/15' : 'group-hover:scale-105 border-white/5'}`}
                            style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <btn.Icon className={`w-5.5 h-5.5 ${btn.iconColor} transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
                          </div>
                          <div className="text-center">
                            <div className="font-black text-[13px] tracking-[0.12em] text-white/90 leading-none">{btn.label}</div>
                            <div className="text-[10px] text-white/30 mt-0.5 font-medium">{btn.subLabel}</div>
                          </div>
                          {count > 0 && (
                            <div className="absolute top-2 right-2 min-w-[20px] h-[20px] rounded-full flex items-center justify-center text-[9px] font-bold text-white/70 px-1.5 animate-pop"
                              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>{count}</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Speed Row: FASTER / SLOWER ── */}
              <div>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-500/15 to-blue-500/15" />
                  <span className="text-[9px] font-bold tracking-[0.25em] text-white/20 uppercase">Tempo</span>
                  <div className="h-px flex-1 bg-gradient-to-r from-blue-500/15 via-emerald-500/15 to-transparent" />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {SPEED_PAIR.map((btn) => {
                    const isActive = lastVote === btn.type;
                    const isFlash = flashVote === btn.type;
                    const count = aggregation.counts?.[btn.type] || 0;
                    return (
                      <button key={btn.type} onClick={() => castVote(btn.type, btn.value)} disabled={cooldown} aria-label={btn.subLabel}
                        className={`relative rounded-2xl vote-btn-shine vote-btn-press overflow-hidden border backdrop-blur-xl transition-all duration-200 cursor-pointer disabled:opacity-30 disabled:scale-100 group ${btn.borderGlow} ${isActive ? `ring-2 ${btn.activeRing}` : ''}`}
                        style={{ background: 'rgba(12, 12, 25, 0.55)', boxShadow: isActive ? `0 0 25px ${btn.glowColor}, 0 0 60px ${btn.glowColor}, inset 0 1px 0 rgba(255,255,255,0.06)` : 'inset 0 1px 0 rgba(255,255,255,0.04)', ['--glow' as string]: btn.glowColor }}>
                        <div className={`absolute inset-0 bg-gradient-to-br ${btn.gradient} opacity-80 transition-opacity duration-200 group-hover:opacity-100`} />
                        {isFlash && <div className="absolute inset-0 bg-white/10 animate-pulse rounded-2xl pointer-events-none" />}
                        <div className="relative z-10 py-4 px-3 flex flex-col items-center gap-2">
                          <div className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-all duration-200 ${isActive ? 'scale-110 border-white/15' : 'group-hover:scale-105 border-white/5'}`}
                            style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <btn.Icon className={`w-5.5 h-5.5 ${btn.iconColor} transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
                          </div>
                          <div className="text-center">
                            <div className="font-black text-[13px] tracking-[0.12em] text-white/90 leading-none">{btn.label}</div>
                            <div className="text-[10px] text-white/30 mt-0.5 font-medium">{btn.subLabel}</div>
                          </div>
                          {count > 0 && (
                            <div className="absolute top-2 right-2 min-w-[20px] h-[20px] rounded-full flex items-center justify-center text-[9px] font-bold text-white/70 px-1.5 animate-pop"
                              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>{count}</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Style Row: GENRE / VISUALS ── */}
              <div>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-500/15 to-pink-500/15" />
                  <span className="text-[9px] font-bold tracking-[0.25em] text-white/20 uppercase">Style</span>
                  <div className="h-px flex-1 bg-gradient-to-r from-pink-500/15 via-purple-500/15 to-transparent" />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {STYLE_PAIR.map((btn) => {
                    const isActive = lastVote === btn.type;
                    const isFlash = flashVote === btn.type;
                    const count = aggregation.counts?.[btn.type] || 0;
                    return (
                      <button key={btn.type} onClick={() => castVote(btn.type, btn.value)} disabled={cooldown} aria-label={btn.subLabel}
                        className={`relative rounded-2xl vote-btn-shine vote-btn-press overflow-hidden border backdrop-blur-xl transition-all duration-200 cursor-pointer disabled:opacity-30 disabled:scale-100 group ${btn.borderGlow} ${isActive ? `ring-2 ${btn.activeRing}` : ''}`}
                        style={{ background: 'rgba(12, 12, 25, 0.55)', boxShadow: isActive ? `0 0 25px ${btn.glowColor}, 0 0 60px ${btn.glowColor}, inset 0 1px 0 rgba(255,255,255,0.06)` : 'inset 0 1px 0 rgba(255,255,255,0.04)', ['--glow' as string]: btn.glowColor }}>
                        <div className={`absolute inset-0 bg-gradient-to-br ${btn.gradient} opacity-80 transition-opacity duration-200 group-hover:opacity-100`} />
                        {isFlash && <div className="absolute inset-0 bg-white/10 animate-pulse rounded-2xl pointer-events-none" />}
                        <div className="relative z-10 py-4 px-3 flex flex-col items-center gap-2">
                          <div className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-all duration-200 ${isActive ? 'scale-110 border-white/15' : 'group-hover:scale-105 border-white/5'}`}
                            style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <btn.Icon className={`w-5.5 h-5.5 ${btn.iconColor} transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
                          </div>
                          <div className="text-center">
                            <div className="font-black text-[13px] tracking-[0.12em] text-white/90 leading-none">{btn.label}</div>
                            <div className="text-[10px] text-white/30 mt-0.5 font-medium">{btn.subLabel}</div>
                          </div>
                          {count > 0 && (
                            <div className="absolute top-2 right-2 min-w-[20px] h-[20px] rounded-full flex items-center justify-center text-[9px] font-bold text-white/70 px-1.5 animate-pop"
                              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>{count}</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* ── Energy Meter ── */}
        <div className="px-5 py-3 mt-2">
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                <span className="text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">Crowd Energy</span>
              </div>
              <span className="text-[11px] font-semibold text-white/40">{energyLabel}</span>
            </div>

            {/* Track with markers */}
            <div className="relative">
              <div className="h-2.5 bg-white/[0.03] rounded-full overflow-hidden border border-white/[0.04]">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out energy-bar-animated relative"
                  style={{
                    width: `${energyPercent}%`,
                    background: energyPercent > 60
                      ? 'linear-gradient(90deg, #a855f7, #ec4899, #f97316)'
                      : energyPercent < 40
                        ? 'linear-gradient(90deg, #06b6d4, #3b82f6)'
                        : 'linear-gradient(90deg, #06b6d4, #a855f7, #ec4899)',
                  }}
                >
                  {/* Shimmer on bar */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50"
                    style={{ animation: 'shineSweep 2s ease-in-out infinite' }} />
                </div>
              </div>
              {/* Center marker */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-4 bg-white/10" />
            </div>

            <div className="flex justify-between text-[10px] text-gray-600 mt-2 font-medium">
              <span className="flex items-center gap-1">
                <IconSnowflake className="w-3 h-3 text-cyan-500/50" /> Chill
              </span>
              <span className="text-[10px] font-mono text-gray-600 tabular-nums">
                {aggregation.energyBias !== undefined ? (aggregation.energyBias > 0 ? '+' : '') + aggregation.energyBias.toFixed(2) : '0.00'}
              </span>
              <span className="flex items-center gap-1">
                Hype <IconFlame className="w-3 h-3 text-orange-500/50" />
              </span>
            </div>
          </div>
        </div>

        {/* ── Buy More Votes (collapsible) ── */}
        {hasVoteAccess && (
          <div className="px-5 pb-3">
            <details className="group">
              <summary className="w-full py-2.5 rounded-xl glass-card text-sm font-medium text-gray-400
                hover:text-gray-300 hover:bg-white/[0.03] active:scale-[0.98] transition-all cursor-pointer text-center list-none
                flex items-center justify-center gap-2">
                <svg className="w-4 h-4 text-purple-400/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="16"/>
                  <line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                <span>Buy More Votes</span>
              </summary>
              <div className="mt-2 space-y-2">
                {VOTE_PACKS.map((pack) => {
                  const isLoading = checkoutLoading && buyingSlug === pack.slug;
                  return (
                    <button
                      key={pack.slug}
                      onClick={() => handleBuyVotes(pack.slug)}
                      disabled={checkoutLoading}
                      className="w-full rounded-xl glass-card vote-btn-press relative overflow-hidden group cursor-pointer"
                    >
                      <div className={`absolute inset-0 bg-gradient-to-r ${pack.gradient} opacity-10 group-hover:opacity-20 transition-opacity`} />
                      <div className="relative z-10 flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/10 flex items-center justify-center">
                            <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                              <line x1="7" y1="7" x2="7.01" y2="7"/>
                            </svg>
                          </div>
                          <div className="text-left">
                            <span className="font-bold text-xs text-white/80">{pack.name}</span>
                            <span className="text-gray-600 text-xs ml-1.5">{pack.votes} votes</span>
                          </div>
                        </div>
                        {isLoading ? (
                          <Spinner size="w-4 h-4" />
                        ) : (
                          <span className="font-bold text-sm text-white/80">{pack.price}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </details>
          </div>
        )}

        {/* ── Error Toast ── */}
        {error && (
          <div className="mx-5 mb-3 p-3 glass-card rounded-xl text-sm text-center flex items-center justify-center gap-2"
            style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
            <svg className="w-4 h-4 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <span className="text-red-300/90">{error}</span>
          </div>
        )}

        {/* ── Footer ── */}
        <footer className="text-center pt-1 pb-5 px-5">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => {
                const supabase = createClient();
                supabase.auth.signOut().then(() => router.push('/login'));
              }}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors cursor-pointer"
            >
              Leave
            </button>
            <div className="w-px h-3 bg-white/5" />
            <div className="text-[10px] text-gray-700 tracking-wide">
              <span className="text-purple-500/40">Flowglad</span>
              {' · '}
              <span className="text-cyan-500/40">Dedalus</span>
              {' · '}
              <span className="text-pink-500/40">K2 Think</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function VotePage() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] text-white flex items-center justify-center">
        <div className="bg-scene" />
        <div className="flex flex-col items-center gap-3">
          <Spinner size="w-6 h-6" />
          <span className="text-gray-500 text-sm">Loading...</span>
        </div>
      </div>
    }>
      <VoteContent />
    </Suspense>
  );
}
