import { useEffect, useMemo, useState } from 'react';

type Activity = {
  id: number;
  name: string;
  description: string | null;
  display_order: number;
  active: number;
};

type Team = {
  id: number;
  team_code: string;
  display_name: string;
  participant_count: number;
};

type ScoreRow = {
  team_id: number;
  score: number;
};

type DashboardPayload = {
  judge: {
    id: number;
    displayName: string;
    judgeNumber: number | null;
  };
  teams: Team[];
  activities: Activity[];
  completedActivityIds: number[];
};

export function JudgePage() {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [scoreMap, setScoreMap] = useState<Record<number, string>>({});
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const selectedActivity = useMemo(
    () => dashboard?.activities.find((activity) => activity.id === selectedActivityId) ?? null,
    [dashboard, selectedActivityId]
  );

  const loadDashboard = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/judge/dashboard');
      const body = (await response.json()) as DashboardPayload | { message: string };

      if (!response.ok) {
        if (response.status === 401) {
          setAuthRequired(true);
          setMessage('Please log in as a judge to continue.');
          setDashboard(null);
          return;
        }

        if (response.status === 403) {
          setAuthRequired(false);
          setMessage('This account does not have judge access.');
          setDashboard(null);
          return;
        }

        setMessage((body as { message?: string }).message ?? 'Unable to load judge dashboard.');
        setDashboard(null);
        return;
      }

      setAuthRequired(false);
      const payload = body as DashboardPayload;
      setDashboard(payload);
      if (payload.activities.length > 0) {
        setSelectedActivityId((prev) => prev ?? payload.activities[0].id);
      }
    } catch {
      setMessage('Unable to load judge dashboard.');
      setDashboard(null);
    } finally {
      setIsLoading(false);
    }
  };

  const loadScores = async (activityId: number) => {
    try {
      const response = await fetch(`/api/scores?activityId=${activityId}`);
      const body = (await response.json()) as { scores?: ScoreRow[]; message?: string };
      if (!response.ok) {
        setMessage(body.message ?? 'Unable to load scores for this activity.');
        return;
      }

      const nextMap: Record<number, string> = {};
      for (const row of body.scores ?? []) {
        nextMap[row.team_id] = String(row.score);
      }
      setScoreMap(nextMap);
    } catch {
      setMessage('Unable to load scores for this activity.');
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (selectedActivityId !== null) {
      loadScores(selectedActivityId);
    }
  }, [selectedActivityId]);

  const saveScores = async () => {
    if (!dashboard || selectedActivityId === null) {
      return;
    }

    const scores = dashboard.teams.map((team) => ({
      teamId: team.id,
      score: Number(scoreMap[team.id] ?? ''),
    }));

    for (const item of scores) {
      if (!Number.isFinite(item.score)) {
        setMessage('Please provide a valid score for each team.');
        return;
      }
    }

    setIsSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/scores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ffdo-csrf': '1',
        },
        body: JSON.stringify({
          activityId: selectedActivityId,
          scores,
        }),
      });

      const body = (await response.json()) as { message: string };
      setMessage(body.message);

      if (response.ok) {
        await loadDashboard();
      }
    } catch {
      setMessage('Unable to save your score. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const loginJudge = async () => {
    if (!loginUsername.trim() || !loginPassword) {
      setMessage('Enter username and password.');
      return;
    }

    setLoginLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ffdo-csrf': '1',
        },
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
        }),
      });

      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(body.message ?? 'Login failed.');
        return;
      }

      setLoginPassword('');
      await loadDashboard();
    } catch {
      setMessage('Unable to log in right now.');
    } finally {
      setLoginLoading(false);
    }
  };

  const logoutJudge = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'x-ffdo-csrf': '1',
        },
      });
    } finally {
      setDashboard(null);
      setAuthRequired(true);
      setSelectedActivityId(null);
      setScoreMap({});
      setMessage('Logged out.');
    }
  };

  if (authRequired && !dashboard) {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-2xl font-bold text-brand-navy">Judge Login</h2>
        <p className="mt-2 text-slate-700">Log in directly on this page to access judge scoring.</p>

        <div className="mt-5 grid gap-3">
          <label className="grid gap-1 text-sm font-semibold text-slate-700" htmlFor="judge-username">
            Username
            <input
              id="judge-username"
              className="rounded-lg border border-slate-300 px-3 py-2"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="grid gap-1 text-sm font-semibold text-slate-700" htmlFor="judge-password">
            Password
            <input
              id="judge-password"
              type="password"
              className="rounded-lg border border-slate-300 px-3 py-2"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          <button
            type="button"
            onClick={loginJudge}
            disabled={loginLoading}
            className="rounded-xl bg-brand-navy px-4 py-3 text-base font-bold text-white disabled:opacity-60"
          >
            {loginLoading ? 'Signing In...' : 'Sign In as Judge'}
          </button>
        </div>

        {message ? <p className="mt-4 text-sm font-semibold text-slate-700" aria-live="polite">{message}</p> : null}
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-brand-navy">Judge Dashboard</h2>
        {dashboard ? (
          <button
            type="button"
            onClick={logoutJudge}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold"
          >
            Log Out
          </button>
        ) : null}
      </div>
      {dashboard ? <p className="mt-2 text-slate-700">Welcome, {dashboard.judge.displayName} - Family Fun Day Olympics</p> : null}

      {isLoading ? <p className="mt-4 text-slate-600" aria-live="polite">Loading dashboard...</p> : null}
      {!isLoading && !dashboard ? <p className="mt-4 text-rose-700">Unable to load judge dashboard.</p> : null}

      {dashboard ? (
        <>
          <div className="mt-5 grid gap-2">
            <label className="text-sm font-semibold text-slate-700" htmlFor="activity-select">
              Active Activity
            </label>
            <select
              id="activity-select"
              value={selectedActivityId ?? ''}
              onChange={(e) => setSelectedActivityId(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-3 text-base"
            >
              {dashboard.activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {dashboard.activities.map((activity) => {
              const completed = dashboard.completedActivityIds.includes(activity.id);
              return (
                <span
                  key={activity.id}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    completed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {activity.name}: {completed ? 'Complete' : 'Awaiting Scores'}
                </span>
              );
            })}
          </div>

          {selectedActivity ? (
            <div className="mt-6 grid gap-3">
              {dashboard.teams.map((team) => (
                <div key={team.id} className="rounded-xl border border-slate-200 p-4">
                  <label className="grid gap-2 text-sm font-semibold text-slate-700" htmlFor={`score-${team.id}`}>
                    <span className="text-base font-bold text-brand-navy">{team.display_name}</span>
                    <input
                      id={`score-${team.id}`}
                      aria-label={`Score for ${team.display_name}`}
                      inputMode="numeric"
                      type="number"
                      className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
                      value={scoreMap[team.id] ?? ''}
                      onChange={(e) =>
                        setScoreMap((prev) => ({
                          ...prev,
                          [team.id]: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              ))}

              <button
                type="button"
                onClick={saveScores}
                disabled={isSaving}
                className="mt-2 rounded-xl bg-brand-navy px-4 py-3 text-base font-bold text-white disabled:opacity-60"
              >
                {isSaving ? 'Saving Scores...' : 'Save Scores'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {message ? <p className="mt-4 text-sm font-semibold text-slate-700" aria-live="polite">{message}</p> : null}
    </section>
  );
}
