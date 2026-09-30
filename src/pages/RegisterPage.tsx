import { FormEvent, useEffect, useMemo, useState } from 'react';

type RegistrationStatus = {
  maximumTeams: number;
  teamsRegistered: number;
  spacesRemaining: number;
  registrationOpen: boolean;
  registrationStatus: 'OPEN' | 'CLOSED';
  message: string;
};

type RegistrationType = 'SINGLE' | 'COMBINED';

const emptyStatus: RegistrationStatus = {
  maximumTeams: 0,
  teamsRegistered: 0,
  spacesRemaining: 0,
  registrationOpen: false,
  registrationStatus: 'CLOSED',
  message: 'Loading registration status...',
};

export function RegisterPage() {
  const [status, setStatus] = useState<RegistrationStatus>(emptyStatus);
  const [registrationType, setRegistrationType] = useState<RegistrationType>('SINGLE');
  const [displayName, setDisplayName] = useState('');
  const [familySurname, setFamilySurname] = useState('');
  const [combinedFamilySurname, setCombinedFamilySurname] = useState('');
  const [participantCount, setParticipantCount] = useState('1');
  const [website, setWebsite] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const suggestedName = useMemo(() => {
    if (registrationType !== 'COMBINED') {
      return '';
    }
    const first = familySurname.trim();
    const second = combinedFamilySurname.trim();
    if (!first || !second) {
      return '';
    }
    return `${first} / ${second} Family`;
  }, [registrationType, familySurname, combinedFamilySurname]);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await fetch('/api/registration/status');
        const body = (await response.json()) as RegistrationStatus;
        setStatus(body);
      } catch {
        setStatus((prev) => ({
          ...prev,
          message: 'Unable to load registration status. Please refresh and try again.',
        }));
      }
    };

    loadStatus();
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');

    if (!status.registrationOpen) {
      setMessage('Registration is currently closed.');
      return;
    }

    const resolvedDisplayName = displayName.trim() || suggestedName;
    if (!resolvedDisplayName) {
      setMessage('Please enter a valid family name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/registration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ffdo-csrf': '1',
        },
        body: JSON.stringify({
          displayName: resolvedDisplayName,
          registrationType,
          familySurname,
          combinedFamilySurname: registrationType === 'COMBINED' ? combinedFamilySurname : '',
          participantCount: Number(participantCount),
          website,
        }),
      });

      const body = (await response.json()) as { message: string };

      setMessage(body.message);

      if (response.ok) {
        setDisplayName('');
        setFamilySurname('');
        setCombinedFamilySurname('');
        setParticipantCount('1');
        setWebsite('');

        const statusResponse = await fetch('/api/registration/status');
        const statusBody = (await statusResponse.json()) as RegistrationStatus;
        setStatus(statusBody);
      }
    } catch {
      setMessage('Unable to submit registration right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-2xl font-bold text-brand-navy">Family Registration</h2>
      <p className="mt-2 text-slate-700">Maximum teams: {status.maximumTeams} · Teams registered: {status.teamsRegistered} · Spaces remaining: {status.spacesRemaining}</p>
      <p className="mt-2 font-semibold text-brand-green" aria-live="polite">{status.message}</p>

      {!status.registrationOpen ? (
        <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          Registration Full or Closed
        </div>
      ) : (
        <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
          <label className="grid gap-1 text-sm font-semibold text-slate-700" htmlFor="registration-type">
            Registration Type
            <select
              id="registration-type"
              value={registrationType}
              onChange={(e) => setRegistrationType(e.target.value as RegistrationType)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-base"
            >
              <option value="SINGLE">Single Family</option>
              <option value="COMBINED">Combined Family</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm font-semibold text-slate-700" htmlFor="family-surname">
            Family Surname
            <input
              id="family-surname"
              value={familySurname}
              onChange={(e) => setFamilySurname(e.target.value)}
              required
              className="rounded-lg border border-slate-300 px-3 py-2 text-base"
            />
          </label>

          {registrationType === 'COMBINED' ? (
            <label className="grid gap-1 text-sm font-semibold text-slate-700" htmlFor="second-family-surname">
              Second Family Surname
              <input
                id="second-family-surname"
                value={combinedFamilySurname}
                onChange={(e) => setCombinedFamilySurname(e.target.value)}
                required
                className="rounded-lg border border-slate-300 px-3 py-2 text-base"
              />
            </label>
          ) : null}

          {suggestedName ? <p className="text-sm text-slate-600">Suggested display name: {suggestedName}</p> : null}

          <label className="grid gap-1 text-sm font-semibold text-slate-700" htmlFor="display-name">
            Team / Family Display Name
            <input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={suggestedName || 'The Vessel Family'}
              className="rounded-lg border border-slate-300 px-3 py-2 text-base"
            />
          </label>

          <label className="grid gap-1 text-sm font-semibold text-slate-700" htmlFor="participant-count">
            Number of Participants
            <input
              id="participant-count"
              type="number"
              min={1}
              max={30}
              inputMode="numeric"
              value={participantCount}
              onChange={(e) => setParticipantCount(e.target.value)}
              required
              className="rounded-lg border border-slate-300 px-3 py-2 text-base"
            />
          </label>

          <label className="hidden" aria-hidden="true">
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-brand-navy px-4 py-3 text-base font-bold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting...' : 'Register Team'}
          </button>

          {message ? <p className="text-sm font-semibold text-slate-700" aria-live="polite">{message}</p> : null}
        </form>
      )}
    </section>
  );
}
