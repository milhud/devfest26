'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useBilling, usePricing } from '@flowglad/nextjs';
import { VoteType, VoteAggregation } from '@/lib/types';

const VOTE_PACKS = [
  { slug: 'dj_vote_credits', name: 'Starter', votes: 50, price: '$1.99', emoji: '🎟️', gradient: 'from-purple-600 to-indigo-600' },
] as const;

const FEATURE_SLUG = '50_vote_credits';
const USAGE_METER_SLUG = 'vote_credits';

interface VoteButtonConfig {
  type: VoteType;
  emoji: string;
  label: string;
  value?: string;
  gradient: string;
  glowColor: string;
  iconBg: string;
}

const VOTE_BUTTONS: VoteButtonConfig[] = [
  {
    type: 'energy_up', emoji: '🔥', label: 'HYPE UP',
    gradient: 'from-orange-600/80 via-red-600/60 to-rose-700/40',
    glowColor: 'rgba(249,115,22,0.4)',
    iconBg: 'bg-orange-500/20',
  },
  {
    type: 'energy_down', emoji: '❄️', label: 'CHILL',
    gradient: 'from-cyan-600/80 via-blue-600/60 to-indigo-700/40',
    glowColor: 'rgba(6,182,212,0.4)',
    iconBg: 'bg-cyan-500/20',
  },
  {
    type: 'drop_request', emoji: '💥', label: 'DROP!',
    gradient: 'from-yellow-500/80 via-amber-600/60 to-orange-700/40',
    glowColor: 'rgba(234,179,8,0.4)',
    iconBg: 'bg-yellow-500/20',
  },
  {
    type: 'genre_switch', emoji: '🔄', label: 'GENRE',
    gradient: 'from-purple-600/80 via-fuchsia-600/60 to-pink-700/40',
    glowColor: 'rgba(168,85,247,0.4)',
    iconBg: 'bg-purple-500/20',
  },
  {
    type: 'speed_up', emoji: '⚡', label: 'FASTER',
    gradient: 'from-emerald-600/80 via-green-600/60 to-teal-700/40',
    glowColor: 'rgba(16,185,129,0.4)',
    iconBg: 'bg-emerald-500/20',
  },
  {
    type: 'viz_style', emoji: '🎨', label: 'VISUALS',
    gradient: 'from-pink-600/80 via-rose-600/60 to-fuchsia-700/40',
    glowColor: 'rgba(236,72,153,0.4)',
    iconBg: 'bg-pink-500/20',
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
    [userId, cooldown, createUsageEvent, billingReload]
  );

  const energyPercent = aggregation.energyBias !== undefined
    ? ((aggregation.energyBias + 1) / 2) * 100
    : 50;

  return (
    <div className="min-h-screen text-white flex flex-col relative">
      {/* Animated background */}
      <div className="bg-scene" />
      <div className="bg-grid" />

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="text-center pt-8 pb-3 px-4">
          <div className="inline-flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-bold tracking-[0.2em] text-red-400 uppercase">Live</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">
            GESTURE <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 text-glow-purple">DJ</span>
          </h1>
          <div className="mt-2 h-[2px] w-20 mx-auto bg-gradient-to-r from-transparent via-purple-500 to-transparent" />
        </header>

        {/* Status bar */}
        <div className="mx-4 mt-2 mb-4 rounded-xl glass px-4 py-3 flex justify-between items-center text-sm">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center text-sm">
              🗳️
            </div>
            <div>
              <span className="text-gray-400 text-xs">Your votes</span>
              <div className="font-bold text-purple-300 text-lg leading-none">{voteCount}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Credits remaining */}
            {creditsRemaining !== null && (
              <div className="text-center px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-gray-400 text-[10px]">Credits</span>
                <div className={`font-bold text-lg leading-none ${
                  creditsRemaining <= 5 ? 'text-red-400' : creditsRemaining <= 15 ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {creditsRemaining}
                </div>
              </div>
            )}
            {aggregation.isHypeSpike && (
              <span className="px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-400 rounded-full text-xs font-bold animate-hype glow-orange">
                HYPE SPIKE
              </span>
            )}
            <div className="text-right">
              <span className="text-gray-400 text-xs">Active</span>
              <div className="font-bold text-cyan-300 text-lg leading-none">{aggregation.total || 0}</div>
            </div>
          </div>
        </div>

        {/* Vote buttons grid */}
        <div className="flex-1 px-4">
          {!billingLoaded ? (
            <div className="max-w-sm mx-auto text-center py-12">
              <svg className="animate-spin w-8 h-8 text-purple-400 mx-auto mb-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              <p className="text-gray-400 text-sm">Loading billing...</p>
              {billing?.errors && billing.errors.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-red-400 text-xs">{billing.errors[0]?.message || 'Billing error'}</p>
                  <button onClick={() => billingReload?.()} className="text-xs text-purple-400 underline cursor-pointer">Retry</button>
                </div>
              )}
            </div>
          ) : !hasVoteAccess ? (
            <div className="max-w-sm mx-auto text-center space-y-5 py-6">
              <div>
                <h2 className="text-xl font-bold mb-1">Get Vote Credits</h2>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Influence the DJ set in real time — control energy, request drops, shape the vibe.
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
                      className={`w-full rounded-2xl glass transition-all duration-200
                        active:scale-[0.97] disabled:opacity-50 relative overflow-hidden group
                        ${'popular' in pack ? 'ring-1 ring-pink-500/40' : ''}`}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-r ${pack.gradient} opacity-20 group-hover:opacity-30 transition-opacity`} />
                      {'popular' in pack && (
                        <div className="absolute -top-px left-1/2 -translate-x-1/2 px-3 py-0.5 bg-pink-500 rounded-b-lg text-[9px] font-bold tracking-wider">
                          POPULAR
                        </div>
                      )}
                      <div className="relative z-10 flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{pack.emoji}</span>
                          <div className="text-left">
                            <div className="font-bold text-sm">{pack.name}</div>
                            <div className="text-gray-400 text-xs">{pack.votes} votes</div>
                          </div>
                        </div>
                        <div className="text-right">
                          {isLoading ? (
                            <svg className="animate-spin w-5 h-5 text-white/50" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                          ) : (
                            <span className="font-bold text-lg">{pack.price}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
              {VOTE_BUTTONS.map((btn) => {
                const isActive = lastVote === btn.type;
                const count = aggregation.counts?.[btn.type] || 0;
                return (
                  <button
                    key={btn.type}
                    onClick={() => castVote(btn.type, btn.value)}
                    disabled={cooldown}
                    className="btn-ripple relative rounded-2xl glass transition-all duration-200
                      active:scale-[0.93] disabled:opacity-40 disabled:scale-100 group"
                    style={{
                      boxShadow: isActive ? `0 0 30px ${btn.glowColor}, 0 0 60px ${btn.glowColor}` : 'none',
                    }}
                  >
                    {/* Gradient overlay */}
                    <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${btn.gradient} opacity-60 group-hover:opacity-80 transition-opacity`} />

                    {/* Content */}
                    <div className="relative z-10 p-5 flex flex-col items-center gap-2">
                      <div className={`w-14 h-14 rounded-xl ${btn.iconBg} backdrop-blur-sm flex items-center justify-center text-3xl
                        transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}>
                        {btn.emoji}
                      </div>
                      <span className="font-bold text-xs tracking-[0.15em] text-white/90">{btn.label}</span>

                      {/* Vote count badge */}
                      {count > 0 && (
                        <div className="absolute top-2 right-2 min-w-[22px] h-[22px] rounded-full bg-white/10 backdrop-blur-sm
                          border border-white/20 flex items-center justify-center text-[10px] font-bold text-white/80 px-1.5">
                          {count}
                        </div>
                      )}
                    </div>

                    {/* Active ring */}
                    {isActive && (
                      <div className="absolute inset-0 rounded-2xl border-2 border-white/40 animate-pulse pointer-events-none" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Energy bar */}
        <div className="px-4 py-4 mt-2">
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">Crowd Energy</span>
              <span className="text-[10px] font-mono text-gray-500">
                {aggregation.energyBias !== undefined ? (aggregation.energyBias > 0 ? '+' : '') + aggregation.energyBias.toFixed(2) : '0.00'}
              </span>
            </div>
            <div className="h-3 bg-white/5 rounded-full overflow-hidden energy-bar-glow">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${energyPercent}%`,
                  background: `linear-gradient(90deg, #06b6d4, #a855f7 50%, #ec4899 75%, #f97316)`,
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 mt-1.5 font-medium">
              <span>❄️ Chill</span>
              <span>🔥 Hype</span>
            </div>
          </div>
        </div>

        {/* Buy more votes button (when user already has access) */}
        {hasVoteAccess && (
          <div className="px-4 pb-3">
            <details className="group">
              <summary className="w-full py-3 rounded-xl glass text-sm font-medium text-gray-300
                hover:bg-white/5 active:scale-[0.98] transition-all cursor-pointer text-center list-none">
                🎟️ Buy More Votes
              </summary>
              <div className="mt-2 space-y-2">
                {VOTE_PACKS.map((pack) => {
                  const isLoading = checkoutLoading && buyingSlug === pack.slug;
                  return (
                    <button
                      key={pack.slug}
                      onClick={() => handleBuyVotes(pack.slug)}
                      disabled={checkoutLoading}
                      className="w-full rounded-xl glass transition-all duration-200
                        active:scale-[0.97] disabled:opacity-50 relative overflow-hidden group"
                    >
                      <div className={`absolute inset-0 bg-gradient-to-r ${pack.gradient} opacity-15 group-hover:opacity-25 transition-opacity`} />
                      <div className="relative z-10 flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{pack.emoji}</span>
                          <div className="text-left">
                            <span className="font-bold text-xs">{pack.name}</span>
                            <span className="text-gray-500 text-xs ml-1">· {pack.votes} votes</span>
                          </div>
                        </div>
                        {isLoading ? (
                          <svg className="animate-spin w-4 h-4 text-white/50" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        ) : (
                          <span className="font-bold text-sm">{pack.price}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </details>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mx-4 mb-3 p-3 glass rounded-xl border-red-500/30 text-red-300 text-sm text-center"
            style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <footer className="text-center py-4 px-4 space-y-2">
          {sessionCode && (
            <div className="glass rounded-lg px-3 py-1.5 inline-flex items-center gap-2 text-xs">
              <span className="text-gray-500">Session</span>
              <span className="font-mono font-bold tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                {sessionCode}
              </span>
            </div>
          )}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                const supabase = createClient();
                supabase.auth.signOut().then(() => router.push('/login'));
              }}
              className="text-[10px] text-gray-600 hover:text-gray-400 underline transition-colors cursor-pointer"
            >
              Leave session
            </button>
            <span className="text-gray-700">·</span>
            <div className="text-[10px] text-gray-600 tracking-wide">
              Powered by <span className="text-purple-500/60">Flowglad</span> &middot; <span className="text-cyan-500/60">Dedalus</span> &middot; <span className="text-pink-500/60">K2 Think</span>
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
      <div className="min-h-screen text-white flex items-center justify-center">
        <div className="bg-scene" />
        <div className="text-gray-400">Loading...</div>
      </div>
    }>
      <VoteContent />
    </Suspense>
  );
}
