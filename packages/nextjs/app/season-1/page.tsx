import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowTrendingUpIcon,
  CheckBadgeIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";

export const metadata: Metadata = {
  title: "Season 1 Rules | Agentic Bets",
  description:
    "Official rules for Agentic Bets Season 1: points, leaderboard logic, anti-sybil review, and $AGBETS reward policy.",
};

const QUICK_FACTS = [
  {
    label: "Format",
    value: "14-day points season",
    tone: "bg-pg-violet/10 text-pg-violet border-pg-violet/20",
  },
  {
    label: "What counts",
    value: "Settled + refunded volume",
    tone: "bg-pg-mint/10 text-pg-mint border-pg-mint/20",
  },
  {
    label: "Daily cap",
    value: "$50 / wallet",
    tone: "bg-pg-amber/10 text-[#9a7200] border-pg-amber/20",
  },
  {
    label: "Rewards",
    value: "Points first",
    tone: "bg-pg-pink/10 text-pg-pink border-pg-pink/20",
  },
];

const SCORING_RULES = [
  {
    title: "Base points",
    body: "1 point per $1 of eligible volume (settled or refunded rounds).",
    icon: ArrowTrendingUpIcon,
    tone: "bg-pg-violet/10 text-pg-violet border-pg-violet/20",
  },
  {
    title: "First-bet unlock",
    body: "One-time bonus unlocks at $10 of total eligible volume.",
    icon: SparklesIcon,
    tone: "bg-pg-amber/10 text-[#9a7200] border-pg-amber/20",
  },
  {
    title: "Leaderboard",
    body: "Ranked by eligible season points — not bet count or wallet age.",
    icon: TrophyIcon,
    tone: "bg-pg-mint/10 text-pg-mint border-pg-mint/20",
  },
];

const ANTI_SYBIL_RULES = [
  "Minimum eligible bet size is $1.",
  "Settled and refunded rounds count toward volume — pending and cancelled rounds do not.",
  "Opposite-side betting in the same round is excluded.",
  "Eligible volume is capped at $50 per wallet per day.",
  "Suspicious wallet clusters can be flagged and excluded before payout.",
];

export default function SeasonOneRulesPage() {
  return (
    <div className="flex flex-col grow">
      <section className="relative px-6 pt-8 md:pt-12 pb-8 overflow-hidden">
        <div className="absolute top-10 right-[10%] w-14 h-14 rounded-full bg-pg-violet/12 border-2 border-pg-violet/20 motion-safe:animate-float hidden md:block" />
        <div className="absolute top-24 right-[18%] w-8 h-8 rounded-xl bg-pg-amber/15 border-2 border-pg-amber/25 rotate-12 motion-safe:animate-float-slow hidden md:block" />
        <div className="absolute top-12 left-[8%] w-10 h-10 rounded-xl bg-pg-pink/10 border-2 border-pg-pink/20 -rotate-6 motion-safe:animate-float-slow hidden lg:block" />

        <div className="max-w-5xl mx-auto relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-pg-violet/25 bg-pg-violet/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-pg-violet">
            <CheckBadgeIcon className="h-3.5 w-3.5" />
            Season 1 Rules
          </div>

          <div className="mt-4 max-w-2xl">
            <h1
              className="text-3xl md:text-5xl font-extrabold tracking-tight text-base-content"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Points first. Abuse gets filtered out.
            </h1>
            <p className="mt-4 text-sm md:text-base text-pg-muted leading-relaxed max-w-xl">
              Season 1 rewards real betting activity. It&apos;s a points-based competition — these rules govern how
              points are earned, how leaderboard standings work, and how eligible wallets are reviewed at season end.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-2 xl:grid-cols-4 gap-3">
            {QUICK_FACTS.map(fact => (
              <div key={fact.label} className={`rounded-2xl border px-4 py-3 ${fact.tone}`}>
                <p
                  className="text-[11px] font-extrabold uppercase tracking-[0.18em]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {fact.label}
                </p>
                <p className="mt-2 text-sm font-bold text-base-content">{fact.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-6 py-10 md:py-14 bg-dots">
        <div className="absolute inset-x-0 top-0 h-px bg-pg-border" />
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <h2
              className="text-xl font-extrabold text-base-content uppercase tracking-wide"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              How points work
            </h2>
            <div className="h-1 w-12 rounded-full bg-pg-violet" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {SCORING_RULES.map(rule => {
              const Icon = rule.icon;
              return (
                <div
                  key={rule.title}
                  className={`rounded-[24px] border p-5 bg-base-100/90 shadow-pop-soft ${rule.tone}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/70 border border-current/15">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3
                      className="text-sm font-extrabold text-base-content mb-0"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      {rule.title}
                    </h3>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-pg-muted">{rule.body}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-[28px] border-2 border-pg-border bg-base-100/90 p-6 shadow-pop-soft">
            <p
              className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-pg-violet"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Example
            </p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-pg-border bg-base-200/45 px-4 py-4">
                <p className="text-xs font-bold text-pg-muted uppercase tracking-wide">Eligible volume</p>
                <p className="mt-2 text-lg font-extrabold text-base-content">$25</p>
              </div>
              <div className="rounded-2xl border border-pg-border bg-base-200/45 px-4 py-4">
                <p className="text-xs font-bold text-pg-muted uppercase tracking-wide">Base points</p>
                <p className="mt-2 text-lg font-extrabold text-base-content">25 pts</p>
              </div>
              <div className="rounded-2xl border border-pg-border bg-base-200/45 px-4 py-4">
                <p className="text-xs font-bold text-pg-muted uppercase tracking-wide">First-bet unlock</p>
                <p className="mt-2 text-lg font-extrabold text-base-content">+10 pts</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative px-6 py-10 md:py-14">
        <div className="absolute inset-x-0 top-0 h-px bg-pg-border" />
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-pg-mint/25 bg-pg-mint/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-pg-mint">
              <ShieldCheckIcon className="h-3.5 w-3.5" />
              Anti-sybil
            </div>
            <div className="h-1 w-12 rounded-full bg-pg-mint" />
          </div>

          <div className="rounded-[28px] border-2 border-pg-border bg-base-100/90 p-6 shadow-pop-soft">
            <ul className="space-y-3">
              {ANTI_SYBIL_RULES.map(rule => (
                <li
                  key={rule}
                  className="flex items-start gap-3 rounded-2xl border border-pg-border bg-base-200/40 px-4 py-3"
                >
                  <ShieldCheckIcon className="h-5 w-5 shrink-0 text-pg-mint mt-0.5" />
                  <span className="text-sm leading-relaxed text-pg-muted">{rule}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="relative px-6 py-10 md:py-14 bg-dots">
        <div className="absolute inset-x-0 top-0 h-px bg-pg-border" />
        <div className="max-w-5xl mx-auto">
          <div className="rounded-[30px] border-2 border-pg-slate bg-base-100 px-6 py-6 md:px-8 md:py-8 shadow-pop">
            <div className="flex flex-col gap-6">
              <div className="max-w-2xl">
                <h2
                  className="text-2xl font-extrabold tracking-tight text-base-content"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Rewards
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-pg-muted">
                  Season 1 is scored through points and leaderboard standings. Any final $AGBETS reward distribution is
                  subject to treasury capacity, anti-sybil review, and final season validation. Distribution details, if
                  approved, will be announced after the season ends.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-pg-muted">
                  Wallets flagged for abusive, coordinated, or sybil-like activity can be excluded from final standings
                  and any reward distribution.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/leaderboard" className="btn-candy text-sm text-center">
                  View leaderboard
                </Link>
                <Link href="/" className="btn-outline-geo text-sm text-center">
                  Browse markets
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
