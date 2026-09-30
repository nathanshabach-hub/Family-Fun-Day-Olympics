import { ReactNode, useEffect, useMemo, useState } from 'react';

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
  colour: string | null;
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

type StepKey = 'step1' | 'step2' | 'step3';

function validHexColour(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : null;
}

function StepAccordion({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between p-4 text-left"
        aria-expanded={open}
      >
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-slate-600">{title}</p>
          <p className="mt-1 text-base font-semibold text-brand-navy">{subtitle}</p>
        </div>
        <span className={`text-sm font-semibold text-slate-600 transition-transform duration-1000 ease-in-out ${open ? 'rotate-180' : 'rotate-0'}`}>
          ▼
        </span>
      </button>

      <div className={`overflow-hidden px-4 transition-all duration-1000 ease-in-out ${open ? 'max-h-[2200px] pb-4 opacity-100' : 'max-h-0 pb-0 opacity-0'}`}>
        {children}
      </div>
    </div>
  );
}

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
  const [isResetting, setIsResetting] = useState(false);
  const [openSteps, setOpenSteps] = useState<Record<StepKey, boolean>>({
    step1: true,
    step2: true,
    step3: true,
  });

  const toggleStep = (step: StepKey) => {
    setOpenSteps((prev) => ({
      ...prev,
      [step]: !prev[step],
    }));
  };

  const selectedActivity = useMemo(
    () => dashboard?.activities.find((activity) => activity.id === selectedActivityId) ?? null,
    [dashboard, selectedActivityId]
  );

  const selectedActivityCompleted = useMemo(() => {
    if (!dashboard || selectedActivityId === null) {
      return false;
    }
    return dashboard.completedActivityIds.includes(selectedActivityId);
  }, [dashboard, selectedActivityId]);

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
          setAuthRequired(true);
          setMessage('This account does not have judge access. Log in with a judge account.');
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

    for (const team of dashboard.teams) {
      const raw = scoreMap[team.id];
      if (raw === undefined || raw.trim() === '') {
        setMessage(`Please enter a score for ${team.display_name}.`);
        return;
      }
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
        const previousActivityId = selectedActivityId;
        await loadDashboard();

        if (dashboard) {
          const previousIndex = dashboard.activities.findIndex((activity) => activity.id === previousActivityId);
          if (previousIndex >= 0) {
            const remaining = dashboard.activities
              .slice(previousIndex + 1)
              .find((activity) => !dashboard.completedActivityIds.includes(activity.id));

            if (remaining) {
              setSelectedActivityId(remaining.id);
            }
          }
        }
      }
    } catch {
      setMessage('Unable to save your score. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetScores = async () => {
    if (!dashboard || selectedActivityId === null) {
      return;
    }

    if (!window.confirm('Reset all your scores for this activity?')) {
      return;
    }

    setIsResetting(true);
    setMessage('');
    try {
      const response = await fetch('/api/scores/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ffdo-csrf': '1',
        },
        body: JSON.stringify({ activityId: selectedActivityId }),
      });

      const body = (await response.json()) as { message: string };
      setMessage(body.message);

      if (response.ok) {
        setScoreMap({});
        await loadDashboard();
        await loadScores(selectedActivityId);
      }
    } catch {
      setMessage('Unable to reset scores right now. Please try again.');
    } finally {
      setIsResetting(false);
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
          <div className="mt-5">
            <StepAccordion
              title="Step 1"
              subtitle="Choose an activity"
              open={openSteps.step1}
              onToggle={() => toggleStep('step1')}
            >
              <p className="text-sm text-slate-600">Tap a card to score that activity.</p>

              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">Awaiting scores</span>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">Complete</span>
                <span className="rounded-full border border-brand-navy px-3 py-1 text-brand-navy">Selected</span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {dashboard.activities.map((activity) => {
                  const completed = dashboard.completedActivityIds.includes(activity.id);
                  const selected = selectedActivityId === activity.id;
                  return (
                    <button
                      type="button"
                      onClick={() => setSelectedActivityId(activity.id)}
                      key={activity.id}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                        completed ? 'border-emerald-200 bg-emerald-100 text-emerald-800' : 'border-amber-200 bg-amber-100 text-amber-800'
                      } ${
                        selected ? 'ring-2 ring-brand-navy ring-offset-1' : 'hover:brightness-95'
                      }`}
                      aria-pressed={selected}
                    >
                      <span className="font-bold">{activity.name}</span>
                      <span className="ml-1">{completed ? 'Complete' : 'Awaiting Scores'}</span>
                    </button>
                  );
                })}
              </div>
            </StepAccordion>
          </div>

          {selectedActivity ? (
            <div className="mt-6 grid gap-3">
              <StepAccordion
                title="Step 2"
                subtitle="Enter scores for all teams"
                open={openSteps.step2}
                onToggle={() => toggleStep('step2')}
              >
                <p className="text-sm text-slate-700">
                  Activity: <span className="font-semibold">{selectedActivity.name}</span> · Status:{' '}
                  <span className={selectedActivityCompleted ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
                    {selectedActivityCompleted ? 'Complete' : 'Awaiting Scores'}
                  </span>
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {dashboard.teams.map((team) => (
                    <div
                      key={team.id}
                      className="rounded-xl border border-slate-200 p-4"
                      style={validHexColour(team.colour) ? { backgroundColor: `${team.colour}22` } : undefined}
                    >
                      <label className="grid gap-2 text-sm font-semibold text-slate-700" htmlFor={`score-${team.id}`}>
                        <span className="text-base font-bold text-brand-navy">{team.display_name}</span>
                        <span className="text-xs font-medium text-slate-500">{team.team_code} · {team.participant_count} participants</span>
                        <input
                          id={`score-${team.id}`}
                          aria-label={`Score for ${team.display_name}`}
                          inputMode="numeric"
                          type="number"
                          required
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
                </div>
              </StepAccordion>

              <StepAccordion
                title="Step 3"
                subtitle="Save or reset this activity"
                open={openSteps.step3}
                onToggle={() => toggleStep('step3')}
              >
                <p className="text-sm text-slate-700">Save once all team scores are filled in.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={resetScores}
                    disabled={isSaving || isResetting}
                    className="w-full rounded-xl border border-rose-300 bg-white px-4 py-3 text-base font-bold text-rose-700 disabled:opacity-60"
                  >
                    {isResetting ? 'Resetting...' : 'Reset Activity Scores'}
                  </button>
                  <button
                    type="button"
                    onClick={saveScores}
                    disabled={isSaving || isResetting}
                    className="w-full rounded-xl bg-brand-navy px-4 py-3 text-base font-bold text-white disabled:opacity-60"
                  >
                    {isSaving ? 'Saving Scores...' : 'Save Scores'}
                  </button>
                </div>
              </StepAccordion>
            </div>
          ) : null}
        </>
      ) : null}

      {message ? <p className="mt-4 text-sm font-semibold text-slate-700" aria-live="polite">{message}</p> : null}
    </section>
  );
}
