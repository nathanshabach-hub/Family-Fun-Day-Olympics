import { useEffect, useRef, useState } from 'react';

type LeaderboardRow = {
  teamId: number;
  teamCode: string;
  teamName: string;
  overallTotal: number;
  activityWins: number;
  rank: number;
  tied: boolean;
};

type LeaderboardResponse = {
  eventStatus: 'REGISTRATION' | 'READY' | 'LIVE' | 'FINISHED';
  complete: boolean;
  incompleteActivities: number[];
  leaderboard: LeaderboardRow[];
};

function medalFor(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '';
}

export function ScoreboardPage() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [message, setMessage] = useState('Loading leaderboard...');
  const etagRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const headers: HeadersInit = {};
        if (etagRef.current) {
          headers['If-None-Match'] = etagRef.current;
        }

        const response = await fetch('/api/leaderboard', { headers });

        if (response.status === 304) {
          if (!cancelled) {
            setMessage('Leaderboard is up to date.');
          }
          return;
        }

        const body = (await response.json()) as LeaderboardResponse | { message: string };
        if (!response.ok) {
          if (!cancelled) {
            setMessage((body as { message?: string }).message ?? 'Unable to load leaderboard.');
          }
          return;
        }

        const nextEtag = response.headers.get('etag');
        if (nextEtag) {
          etagRef.current = nextEtag;
        }

        if (!cancelled) {
          setData(body as LeaderboardResponse);
          setMessage('Leaderboard updated.');
        }
      } catch {
        if (!cancelled) {
          setMessage('Unable to load leaderboard right now.');
        }
      }
    };

    load();
    const timer = setInterval(load, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl font-black tracking-wide text-brand-navy">LEADERBOARD</h2>
        {data ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            Status: {data.eventStatus}
          </span>
        ) : null}
      </div>

      {data ? (
        <p className="mt-3 text-sm font-semibold text-slate-700">
          {data.complete
            ? data.eventStatus === 'FINISHED'
              ? 'Final standings'
              : 'All activities currently complete'
            : 'Live standings - some activities still missing scores'}
        </p>
      ) : null}

      <div className="mt-6 grid gap-3" role="list" aria-label="Leaderboard standings">
        {data?.leaderboard.map((row) => (
          <article
            key={row.teamId}
            role="listitem"
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-4"
          >
            <div className="w-16 text-center">
              <p className="text-2xl font-black text-brand-navy">{row.rank}</p>
              <p className="text-xl">{medalFor(row.rank)}</p>
            </div>
            <div>
              <p className="text-xl font-extrabold text-brand-navy">{row.teamName}</p>
              <p className="text-sm text-slate-600">
                {row.teamCode} · Activity Wins: {row.activityWins} {row.tied ? '· Tied' : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-brand-green">{row.overallTotal}</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">points</p>
            </div>
          </article>
        ))}
      </div>

      <p className="mt-4 text-xs font-semibold text-slate-500" aria-live="polite">{message}</p>
    </section>
  );
}
