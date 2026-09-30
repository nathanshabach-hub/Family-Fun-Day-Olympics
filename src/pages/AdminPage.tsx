import { FormEvent, ReactNode, useEffect, useState } from 'react';

type Team = {
  id: number;
  team_code: string;
  display_name: string;
  registration_type: 'SINGLE' | 'COMBINED';
  family_surname: string;
  combined_family_surname: string | null;
  participant_count: number;
  status: 'ACTIVE' | 'DELETED';
};

type Activity = {
  id: number;
  name: string;
  description: string | null;
  display_order: number;
  active: number;
};

type ScoreMatrixRow = {
  team_id: number;
  team_name: string;
  activity_id: number;
  activity_name: string;
  score_id: number | null;
  judge_id: number | null;
  score: number | null;
};

type OverviewData = {
  teamsCount: number;
  activitiesCount: number;
  registrationStatus: 'OPEN' | 'CLOSED';
  eventStatus: 'REGISTRATION' | 'READY' | 'LIVE' | 'FINISHED';
  scoringLocked: boolean;
  scoreCount: number;
  latestScores: Array<{
    id: number;
    team_name: string;
    activity_name: string;
    judge_id: number;
    score: number;
    updated_at: string;
  }>;
  missingByActivity: Array<{
    id: number;
    name: string;
    missing_count: number;
  }>;
};

type SettingsData = {
  registrationStatus: 'OPEN' | 'CLOSED';
  eventStatus: 'REGISTRATION' | 'READY' | 'LIVE' | 'FINISHED';
  maximumTeams: number;
  minimumScore: number;
  maximumScore: number;
  scoreboardPublic: boolean;
  judgesCanEdit: boolean;
  scoringLocked: boolean;
  participantNamesEnabled: boolean;
};

type AuditEntry = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string;
  is_admin_change: number;
  created_at: string;
  username: string;
  display_name: string;
};

type AccordionKey =
  | 'overview'
  | 'settings'
  | 'teamCreate'
  | 'teams'
  | 'activities'
  | 'scoreMatrix'
  | 'exports'
  | 'audit';

type AccordionSectionProps = {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
};

function AccordionSection({ title, open, onToggle, children, className = '' }: AccordionSectionProps) {
  return (
    <div className={`rounded-xl border border-slate-200 ${className}`.trim()}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <h3 className="text-lg font-bold text-brand-navy">{title}</h3>
        <span
          className={`text-sm font-semibold text-slate-600 transition-transform duration-700 ease-in-out ${open ? 'rotate-180' : 'rotate-0'}`}
          aria-hidden="true"
        >
          ▼
        </span>
      </button>

      <div
        className={`overflow-hidden px-4 transition-all duration-700 ease-in-out ${open ? 'max-h-[2200px] pb-4 opacity-100' : 'max-h-0 pb-0 opacity-0'}`}
      >
        {children}
      </div>
    </div>
  );
}

export function AdminPage() {
  const [accessState, setAccessState] = useState<'checking' | 'login' | 'forbidden' | 'ready'>('checking');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [scoreMatrix, setScoreMatrix] = useState<ScoreMatrixRow[]>([]);
  const [scoreMatrixLoading, setScoreMatrixLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [registrationType, setRegistrationType] = useState<'SINGLE' | 'COMBINED'>('SINGLE');
  const [familySurname, setFamilySurname] = useState('');
  const [combinedFamilySurname, setCombinedFamilySurname] = useState('');
  const [participantCount, setParticipantCount] = useState('1');
  const [activityName, setActivityName] = useState('');
  const [activityDescription, setActivityDescription] = useState('');
  const [activityOrder, setActivityOrder] = useState('0');
  const [editingActivityId, setEditingActivityId] = useState<number | null>(null);
  const [editingActivityName, setEditingActivityName] = useState('');
  const [editingActivityOrder, setEditingActivityOrder] = useState('0');
  const [openSections, setOpenSections] = useState<Record<AccordionKey, boolean>>({
    overview: true,
    settings: true,
    teamCreate: true,
    teams: true,
    activities: true,
    scoreMatrix: true,
    exports: true,
    audit: true,
  });

  const toggleSection = (key: AccordionKey) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const loadTeams = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/teams');
      const body = (await response.json()) as { teams?: Team[]; message?: string };
      if (!response.ok) {
        setMessage(body.message ?? 'Unable to load teams.');
        setTeams([]);
      } else {
        setTeams(body.teams ?? []);
      }
    } catch {
      setMessage('Unable to load teams.');
      setTeams([]);
    } finally {
      setLoading(false);
    }
  };

  const initializeAdminPage = async () => {
    setAccessState('checking');
    try {
      const response = await fetch('/api/auth/me');
      const body = (await response.json()) as {
        authenticated: boolean;
        user: { role: 'ADMIN' | 'JUDGE' | 'PUBLIC' } | null;
      };

      if (!response.ok || !body.authenticated || !body.user) {
        setAccessState('login');
        return;
      }

      if (body.user.role !== 'ADMIN') {
        setAccessState('forbidden');
        setMessage('This account does not have admin access.');
        return;
      }

      setAccessState('ready');
      await Promise.all([
        loadTeams(),
        loadActivities(),
        loadScoreMatrix(),
        loadOverview(),
        loadSettings(),
        loadAudit(),
      ]);
    } catch {
      setAccessState('login');
      setMessage('Unable to validate session. Please sign in again.');
    }
  };

  useEffect(() => {
    initializeAdminPage();
  }, []);

  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      const response = await fetch('/api/admin/overview');
      const body = (await response.json()) as OverviewData | { message?: string };
      if (!response.ok) {
        setMessage((body as { message?: string }).message ?? 'Unable to load overview.');
        setOverview(null);
      } else {
        setOverview(body as OverviewData);
      }
    } catch {
      setMessage('Unable to load overview.');
      setOverview(null);
    } finally {
      setOverviewLoading(false);
    }
  };

  const loadSettings = async () => {
    setSettingsLoading(true);
    try {
      const response = await fetch('/api/settings');
      const body = (await response.json()) as { settings?: SettingsData; message?: string };
      if (!response.ok || !body.settings) {
        setMessage(body.message ?? 'Unable to load settings.');
        setSettings(null);
      } else {
        setSettings(body.settings);
      }
    } catch {
      setMessage('Unable to load settings.');
      setSettings(null);
    } finally {
      setSettingsLoading(false);
    }
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const response = await fetch('/api/admin/audit?limit=50');
      const body = (await response.json()) as { entries?: AuditEntry[]; message?: string };
      if (!response.ok) {
        setMessage(body.message ?? 'Unable to load audit log.');
        setAuditEntries([]);
      } else {
        setAuditEntries(body.entries ?? []);
      }
    } catch {
      setMessage('Unable to load audit log.');
      setAuditEntries([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const loadActivities = async () => {
    setActivitiesLoading(true);
    try {
      const response = await fetch('/api/activities');
      const body = (await response.json()) as { activities?: Activity[]; message?: string };
      if (!response.ok) {
        setMessage(body.message ?? 'Unable to load activities.');
        setActivities([]);
      } else {
        setActivities(body.activities ?? []);
      }
    } catch {
      setMessage('Unable to load activities.');
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  };

  const loadScoreMatrix = async () => {
    setScoreMatrixLoading(true);
    try {
      const response = await fetch('/api/admin/score-matrix');
      const body = (await response.json()) as { rows?: ScoreMatrixRow[]; message?: string };
      if (!response.ok) {
        setMessage(body.message ?? 'Unable to load score matrix.');
        setScoreMatrix([]);
      } else {
        setScoreMatrix(body.rows ?? []);
      }
    } catch {
      setMessage('Unable to load score matrix.');
      setScoreMatrix([]);
    } finally {
      setScoreMatrixLoading(false);
    }
  };

  const resetForm = () => {
    setDisplayName('');
    setRegistrationType('SINGLE');
    setFamilySurname('');
    setCombinedFamilySurname('');
    setParticipantCount('1');
  };

  const createTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');

    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ffdo-csrf': '1',
        },
        body: JSON.stringify({
          displayName,
          registrationType,
          familySurname,
          combinedFamilySurname: registrationType === 'COMBINED' ? combinedFamilySurname : '',
          participantCount: Number(participantCount),
        }),
      });

      const body = (await response.json()) as { message: string };
      setMessage(body.message);
      if (response.ok) {
        resetForm();
        await loadTeams();
        await loadScoreMatrix();
        await loadOverview();
      }
    } catch {
      setMessage('Unable to create team right now. Please try again.');
    }
  };

  const updateTeamName = async (team: Team) => {
    const nextName = window.prompt('Enter new team display name:', team.display_name);
    if (!nextName || !nextName.trim()) {
      return;
    }

    const response = await fetch(`/api/teams/${team.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-ffdo-csrf': '1',
      },
      body: JSON.stringify({
        displayName: nextName.trim(),
        registrationType: team.registration_type,
        familySurname: team.family_surname,
        combinedFamilySurname: team.combined_family_surname ?? '',
        participantCount: team.participant_count,
      }),
    });

    const body = (await response.json()) as { message: string };
    setMessage(body.message);
    if (response.ok) {
      await loadTeams();
      await loadScoreMatrix();
      await loadOverview();
      await loadAudit();
    }
  };

  const deleteTeam = async (team: Team) => {
    if (!window.confirm(`Delete ${team.display_name}?`)) {
      return;
    }

    const response = await fetch(`/api/teams/${team.id}`, {
      method: 'DELETE',
      headers: {
        'x-ffdo-csrf': '1',
      },
    });

    const body = (await response.json()) as { message: string };
    setMessage(body.message);
    if (response.ok) {
      await loadTeams();
      await loadScoreMatrix();
      await loadOverview();
      await loadAudit();
    }
  };

  const createActivity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await fetch('/api/activities', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ffdo-csrf': '1',
      },
      body: JSON.stringify({
        name: activityName,
        description: activityDescription,
        displayOrder: Number(activityOrder),
        active: true,
      }),
    });

    const body = (await response.json()) as { message: string };
    setMessage(body.message);
    if (response.ok) {
      setActivityName('');
      setActivityDescription('');
      setActivityOrder('0');
      await loadActivities();
      await loadScoreMatrix();
      await loadOverview();
      await loadAudit();
    }
  };

  const toggleActivity = async (activity: Activity) => {
    const path = activity.active ? 'disable' : 'enable';
    const response = await fetch(`/api/activities/${activity.id}/${path}`, {
      method: 'PUT',
      headers: {
        'x-ffdo-csrf': '1',
      },
    });
    const body = (await response.json()) as { message: string };
    setMessage(body.message);
    if (response.ok) {
      await loadActivities();
      await loadScoreMatrix();
      await loadOverview();
      await loadAudit();
    }
  };

  const startRenameActivity = (activity: Activity) => {
    setEditingActivityId(activity.id);
    setEditingActivityName(activity.name);
    setEditingActivityOrder(String(activity.display_order));
  };

  const cancelRenameActivity = () => {
    setEditingActivityId(null);
    setEditingActivityName('');
    setEditingActivityOrder('0');
  };

  const saveRenameActivity = async (activity: Activity) => {
    const nextName = editingActivityName.trim();
    const nextOrder = Number(editingActivityOrder);
    if (!nextName) {
      setMessage('Please enter a valid activity name.');
      return;
    }

    if (!Number.isInteger(nextOrder) || nextOrder < 0) {
      setMessage('Please enter a valid activity order.');
      return;
    }

    const response = await fetch(`/api/activities/${activity.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-ffdo-csrf': '1',
      },
      body: JSON.stringify({
        name: nextName,
        description: activity.description ?? '',
        displayOrder: nextOrder,
        active: Boolean(activity.active),
      }),
    });

    const body = (await response.json()) as { message: string };
    setMessage(body.message);
    if (response.ok) {
      cancelRenameActivity();
      await loadActivities();
      await loadScoreMatrix();
      await loadOverview();
      await loadAudit();
    }
  };

  const deleteActivity = async (activity: Activity) => {
    if (!window.confirm(`Delete activity ${activity.name}?`)) {
      return;
    }
    const response = await fetch(`/api/activities/${activity.id}`, {
      method: 'DELETE',
      headers: {
        'x-ffdo-csrf': '1',
      },
    });
    const body = (await response.json()) as { message: string };
    setMessage(body.message);
    if (response.ok) {
      await loadActivities();
      await loadScoreMatrix();
      await loadOverview();
      await loadAudit();
    }
  };

  const correctScore = async (row: ScoreMatrixRow) => {
    if (!row.score_id) {
      setMessage('Cannot correct a missing score record yet. Ask judge to submit first.');
      return;
    }

    const nextValue = window.prompt('Enter corrected score:', row.score === null ? '' : String(row.score));
    if (nextValue === null) {
      return;
    }

    const numeric = Number(nextValue);
    if (!Number.isFinite(numeric)) {
      setMessage('Please enter a valid numeric score.');
      return;
    }

    const response = await fetch(`/api/scores/${row.score_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-ffdo-csrf': '1',
      },
      body: JSON.stringify({ score: numeric }),
    });

    const body = (await response.json()) as { message: string };
    setMessage(body.message);
    if (response.ok) {
      await loadScoreMatrix();
      await loadOverview();
      await loadAudit();
    }
  };

  const updateSettingsField = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) {
      return;
    }

    setSettingsSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-ffdo-csrf': '1',
        },
        body: JSON.stringify(settings),
      });

      const body = (await response.json()) as { message: string };
      setMessage(body.message);
      if (response.ok) {
        await loadSettings();
        await loadOverview();
        await loadAudit();
      }
    } catch {
      setMessage('Unable to save settings right now.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const loginAdmin = async () => {
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
      await initializeAdminPage();
    } catch {
      setMessage('Unable to log in right now.');
    } finally {
      setLoginLoading(false);
    }
  };

  const logoutAdmin = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'x-ffdo-csrf': '1',
        },
      });
    } finally {
      setAccessState('login');
      setTeams([]);
      setActivities([]);
      setScoreMatrix([]);
      setOverview(null);
      setSettings(null);
      setAuditEntries([]);
      setMessage('Logged out.');
    }
  };

  if (accessState === 'checking') {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-2xl font-bold text-brand-navy">Admin Login</h2>
        <p className="mt-3 text-slate-700" aria-live="polite">Checking session...</p>
      </section>
    );
  }

  if (accessState === 'login') {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-2xl font-bold text-brand-navy">Admin Login</h2>
        <p className="mt-2 text-slate-700">Log in directly on this page to access admin controls.</p>

        <div className="mt-5 grid gap-3">
          <label className="grid gap-1 text-sm font-semibold text-slate-700" htmlFor="admin-username">
            Username
            <input
              id="admin-username"
              className="rounded-lg border border-slate-300 px-3 py-2"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="grid gap-1 text-sm font-semibold text-slate-700" htmlFor="admin-password">
            Password
            <input
              id="admin-password"
              type="password"
              className="rounded-lg border border-slate-300 px-3 py-2"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          <button
            type="button"
            onClick={loginAdmin}
            disabled={loginLoading}
            className="rounded-xl bg-brand-navy px-4 py-3 text-base font-bold text-white disabled:opacity-60"
          >
            {loginLoading ? 'Signing In...' : 'Sign In as Admin'}
          </button>
        </div>

        {message ? <p className="mt-4 text-sm font-semibold text-slate-700" aria-live="polite">{message}</p> : null}
      </section>
    );
  }

  if (accessState === 'forbidden') {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-2xl font-bold text-brand-navy">Admin Access</h2>
        <p className="mt-3 text-rose-700">{message || 'This account is not allowed to access admin tools.'}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-brand-navy">Admin Team Management</h2>
        <button
          type="button"
          onClick={logoutAdmin}
          className="rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold"
        >
          Log Out
        </button>
      </div>
      <p className="mt-2 text-slate-700">Manage team records, including create, update, and soft delete actions.</p>

      <AccordionSection
        className="mt-6"
        title="Overview"
        open={openSections.overview}
        onToggle={() => toggleSection('overview')}
      >
        {overviewLoading ? <p className="mt-2 text-slate-600">Loading overview...</p> : null}
        {overview ? (
          <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <p>Teams: {overview.teamsCount}</p>
            <p>Activities: {overview.activitiesCount}</p>
            <p>Scores submitted: {overview.scoreCount}</p>
            <p>Registration: {overview.registrationStatus}</p>
            <p>Event status: {overview.eventStatus}</p>
            <p>Scoring lock: {overview.scoringLocked ? 'Locked' : 'Unlocked'}</p>
          </div>
        ) : null}
        {overview?.missingByActivity?.length ? (
          <div className="mt-3">
            <p className="text-sm font-semibold text-slate-700">Missing scores by activity:</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
              {overview.missingByActivity.map((m) => (
                <li key={m.id}>
                  {m.name}: {m.missing_count === 0 ? 'Complete' : `${m.missing_count} missing`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </AccordionSection>

      <AccordionSection
        className="mt-5"
        title="Settings"
        open={openSections.settings}
        onToggle={() => toggleSection('settings')}
      >
        <form className="grid gap-3" onSubmit={saveSettings}>
          {settingsLoading ? <p className="text-slate-600">Loading settings...</p> : null}
          {settings ? (
            <>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Registration Status
                <select
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  value={settings.registrationStatus}
                  onChange={(e) => updateSettingsField('registrationStatus', e.target.value as SettingsData['registrationStatus'])}
                >
                  <option value="OPEN">OPEN</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Event Status
                <select
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  value={settings.eventStatus}
                  onChange={(e) => updateSettingsField('eventStatus', e.target.value as SettingsData['eventStatus'])}
                >
                  <option value="REGISTRATION">REGISTRATION</option>
                  <option value="READY">READY</option>
                  <option value="LIVE">LIVE</option>
                  <option value="FINISHED">FINISHED</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Maximum Teams
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  type="number"
                  min={1}
                  value={settings.maximumTeams}
                  onChange={(e) => updateSettingsField('maximumTeams', Number(e.target.value))}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  Minimum Score
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    type="number"
                    value={settings.minimumScore}
                    onChange={(e) => updateSettingsField('minimumScore', Number(e.target.value))}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  Maximum Score
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    type="number"
                    value={settings.maximumScore}
                    onChange={(e) => updateSettingsField('maximumScore', Number(e.target.value))}
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={settings.scoreboardPublic} onChange={(e) => updateSettingsField('scoreboardPublic', e.target.checked)} />
                Scoreboard Public
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={settings.judgesCanEdit} onChange={(e) => updateSettingsField('judgesCanEdit', e.target.checked)} />
                Judges Can Edit Scores
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={settings.scoringLocked} onChange={(e) => updateSettingsField('scoringLocked', e.target.checked)} />
                Scoring Locked
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.participantNamesEnabled}
                  onChange={(e) => updateSettingsField('participantNamesEnabled', e.target.checked)}
                />
                Participant Names Enabled
              </label>

              <button
                className="rounded-lg bg-brand-navy px-4 py-2 font-bold text-white disabled:opacity-60"
                type="submit"
                disabled={settingsSaving}
              >
                {settingsSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </>
          ) : null}
        </form>
      </AccordionSection>

      <AccordionSection
        className="mt-5"
        title="Create Team"
        open={openSections.teamCreate}
        onToggle={() => toggleSection('teamCreate')}
      >
        <form className="grid gap-3" onSubmit={createTeam}>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
          <select
            className="rounded-lg border border-slate-300 px-3 py-2"
            value={registrationType}
            onChange={(e) => setRegistrationType(e.target.value as 'SINGLE' | 'COMBINED')}
          >
            <option value="SINGLE">Single Family</option>
            <option value="COMBINED">Combined Family</option>
          </select>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Family surname"
            value={familySurname}
            onChange={(e) => setFamilySurname(e.target.value)}
            required
          />
          {registrationType === 'COMBINED' ? (
            <input
              className="rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Second family surname"
              value={combinedFamilySurname}
              onChange={(e) => setCombinedFamilySurname(e.target.value)}
              required
            />
          ) : null}
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            type="number"
            min={1}
            max={30}
            value={participantCount}
            onChange={(e) => setParticipantCount(e.target.value)}
            required
          />
          <button className="rounded-lg bg-brand-navy px-4 py-2 font-bold text-white" type="submit">
            Create Team
          </button>
        </form>
      </AccordionSection>

      {message ? <p className="mt-4 text-sm font-semibold text-slate-700">{message}</p> : null}

      <AccordionSection
        className="mt-6"
        title="Teams"
        open={openSections.teams}
        onToggle={() => toggleSection('teams')}
      >
        {loading ? <p className="mt-2 text-slate-600">Loading teams...</p> : null}
        {!loading && teams.length === 0 ? <p className="mt-2 text-slate-600">No teams found.</p> : null}
        <ul className="mt-3 grid gap-3">
          {teams.map((team) => (
            <li key={team.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-brand-navy">{team.display_name}</p>
                  <p className="text-sm text-slate-600">
                    {team.team_code} · {team.registration_type} · {team.participant_count} participants · {team.status}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold"
                    onClick={() => updateTeamName(team)}
                  >
                    Edit Name
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-rose-300 px-3 py-1 text-sm font-semibold text-rose-700"
                    onClick={() => deleteTeam(team)}
                    disabled={team.status === 'DELETED'}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </AccordionSection>

      <AccordionSection
        className="mt-8"
        title="Activities"
        open={openSections.activities}
        onToggle={() => toggleSection('activities')}
      >
        <form className="mt-3 grid gap-3" onSubmit={createActivity}>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Activity name"
            value={activityName}
            onChange={(e) => setActivityName(e.target.value)}
            required
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Description"
            value={activityDescription}
            onChange={(e) => setActivityDescription(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            type="number"
            min={0}
            value={activityOrder}
            onChange={(e) => setActivityOrder(e.target.value)}
            required
          />
          <button className="rounded-lg bg-brand-navy px-4 py-2 font-bold text-white" type="submit">
            Create Activity
          </button>
        </form>

        {activitiesLoading ? <p className="mt-2 text-slate-600">Loading activities...</p> : null}
        {!activitiesLoading && activities.length === 0 ? <p className="mt-2 text-slate-600">No activities found.</p> : null}
        <ul className="mt-3 grid gap-3">
          {activities.map((activity) => (
            <li key={activity.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {editingActivityId === activity.id ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm font-semibold text-brand-navy"
                        value={editingActivityName}
                        onChange={(e) => setEditingActivityName(e.target.value)}
                        aria-label={`Edit name for ${activity.name}`}
                      />
                      <input
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm font-semibold text-brand-navy"
                        type="number"
                        min={0}
                        value={editingActivityOrder}
                        onChange={(e) => setEditingActivityOrder(e.target.value)}
                        aria-label={`Edit order for ${activity.name}`}
                      />
                    </div>
                  ) : (
                    <p className="font-bold text-brand-navy">{activity.name}</p>
                  )}
                  <p className="text-sm text-slate-600">
                    Order {editingActivityId === activity.id ? editingActivityOrder : activity.display_order} · {activity.active ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {editingActivityId === activity.id ? (
                    <>
                      <button
                        type="button"
                        className="rounded-md border border-emerald-300 px-3 py-1 text-sm font-semibold text-emerald-700"
                        onClick={() => saveRenameActivity(activity)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold"
                        onClick={cancelRenameActivity}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold"
                      onClick={() => startRenameActivity(activity)}
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-md border border-sky-300 px-3 py-1 text-sm font-semibold text-sky-700"
                    onClick={() => toggleActivity(activity)}
                  >
                    {activity.active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-rose-300 px-3 py-1 text-sm font-semibold text-rose-700"
                    onClick={() => deleteActivity(activity)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </AccordionSection>

      <AccordionSection
        className="mt-8"
        title="Score Matrix"
        open={openSections.scoreMatrix}
        onToggle={() => toggleSection('scoreMatrix')}
      >
        {scoreMatrixLoading ? <p className="mt-2 text-slate-600">Loading score matrix...</p> : null}
        {!scoreMatrixLoading && scoreMatrix.length === 0 ? <p className="mt-2 text-slate-600">No scores found yet.</p> : null}
        <ul className="mt-3 grid gap-3">
          {scoreMatrix.map((row, index) => (
            <li key={`${row.team_id}-${row.activity_id}-${row.judge_id ?? 'missing'}-${index}`} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-brand-navy">{row.team_name} · {row.activity_name}</p>
                  <p className="text-sm text-slate-600">
                    Judge {row.judge_id ?? '-'} · Score: {row.score ?? 'Missing'}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold"
                  onClick={() => correctScore(row)}
                  disabled={!row.score_id}
                >
                  Correct Score
                </button>
              </div>
            </li>
          ))}
        </ul>
      </AccordionSection>

      <AccordionSection
        className="mt-8"
        title="Exports"
        open={openSections.exports}
        onToggle={() => toggleSection('exports')}
      >
        <p className="mt-1 text-sm text-slate-600">Download event results and backup data files.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href="/api/admin/export/results.csv"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold"
          >
            Download Results CSV
          </a>
          <a
            href="/api/admin/export/event.json"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold"
          >
            Download Event JSON
          </a>
        </div>
      </AccordionSection>

      <AccordionSection
        className="mt-8"
        title="Audit Log"
        open={openSections.audit}
        onToggle={() => toggleSection('audit')}
      >
        {auditLoading ? <p className="mt-2 text-slate-600">Loading audit log...</p> : null}
        {!auditLoading && auditEntries.length === 0 ? <p className="mt-2 text-slate-600">No audit entries found.</p> : null}
        <ul className="mt-3 grid gap-2">
          {auditEntries.map((entry) => (
            <li key={entry.id} className="rounded-md border border-slate-200 p-3 text-sm text-slate-700">
              <p className="font-semibold text-brand-navy">
                {entry.action} · {entry.entity_type}:{entry.entity_id}
              </p>
              <p>
                {entry.display_name} ({entry.username}) · {entry.is_admin_change ? 'Admin change' : 'User change'} · {new Date(entry.created_at).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </AccordionSection>
    </section>
  );
}
