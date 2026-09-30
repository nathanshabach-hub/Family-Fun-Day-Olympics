export type RegistrationSummary = {
  maximumTeams: number;
  teamsRegistered: number;
  spacesRemaining: number;
  registrationOpen: boolean;
  registrationStatus: 'OPEN' | 'CLOSED';
  message: string;
  isFull: boolean;
};

export function summarizeRegistration(
  maximumTeams: number,
  teamsRegistered: number,
  registrationStatus: 'OPEN' | 'CLOSED'
): RegistrationSummary {
  const spacesRemaining = Math.max(maximumTeams - teamsRegistered, 0);
  const isFull = teamsRegistered >= maximumTeams;
  const registrationOpen = registrationStatus === 'OPEN' && !isFull;

  return {
    maximumTeams,
    teamsRegistered,
    spacesRemaining,
    registrationOpen,
    registrationStatus: registrationOpen ? 'OPEN' : 'CLOSED',
    message: isFull ? 'Registration Full' : registrationOpen ? 'Registration is open.' : 'Registration is currently closed.',
    isFull,
  };
}

export function hasCapacity(maximumTeams: number, teamsRegistered: number): boolean {
  return teamsRegistered < maximumTeams;
}
