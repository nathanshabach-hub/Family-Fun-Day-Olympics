import type { Env } from '../types';

export type TeamRegistrationType = 'SINGLE' | 'COMBINED';

export type TeamInput = {
  displayName: string;
  registrationType: TeamRegistrationType;
  familySurname: string;
  combinedFamilySurname: string | null;
  participantCount: number;
};

type EventSettings = {
  maximum_teams: number;
};

async function getSettings(db: D1Database): Promise<EventSettings> {
  const settings = (await db
    .prepare('SELECT maximum_teams FROM event_settings WHERE id = 1 LIMIT 1')
    .first()) as EventSettings | null;

  if (!settings) {
    throw new Error('Event settings not found.');
  }

  return settings;
}

export async function countActiveTeams(db: D1Database): Promise<number> {
  const row = (await db
    .prepare("SELECT COUNT(*) AS active_count FROM teams WHERE status != 'DELETED'")
    .first()) as { active_count: number } | null;

  return row?.active_count ?? 0;
}

async function tryInsertTeam(db: D1Database, input: TeamInput, teamCode: string): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO teams (
        team_code,
        display_name,
        registration_type,
        family_surname,
        combined_family_surname,
        participant_count,
        status
      )
      SELECT ?, ?, ?, ?, ?, ?, 'ACTIVE'
      FROM event_settings
      WHERE id = 1
        AND (SELECT COUNT(*) FROM teams WHERE status != 'DELETED') < maximum_teams`
    )
    .bind(
      teamCode,
      input.displayName,
      input.registrationType,
      input.familySurname,
      input.combinedFamilySurname,
      input.participantCount
    )
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export async function createTeamWithCap(db: D1Database, input: TeamInput): Promise<{ teamCode: string }> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const counterRow = (await db
      .prepare('SELECT team_code_counter FROM event_settings WHERE id = 1 LIMIT 1')
      .first()) as { team_code_counter: number } | null;

    if (!counterRow) {
      throw new Error('Event settings not initialized.');
    }

    const nextNumber = counterRow.team_code_counter + 1;
    const teamCode = `TEAM-${String(nextNumber).padStart(3, '0')}`;

    try {
      const inserted = await tryInsertTeam(db, input, teamCode);
      if (!inserted) {
        const activeCount = await countActiveTeams(db);
        const settings = await getSettings(db);
        if (activeCount >= settings.maximum_teams) {
          throw new Error(`All ${settings.maximum_teams} team places have already been filled.`);
        }
        continue;
      }

      await db
        .prepare(
          `UPDATE event_settings
           SET team_code_counter = CASE WHEN team_code_counter < ? THEN ? ELSE team_code_counter END,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = 1`
        )
        .bind(nextNumber, nextNumber)
        .run();

      return { teamCode };
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (text.includes('UNIQUE constraint failed: teams.team_code')) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Unable to create team right now. Please try again.');
}

export async function logAudit(
  db: D1Database,
  userId: number,
  action: string,
  entityType: string,
  entityId: string,
  oldValue: unknown,
  newValue: unknown,
  isAdminChange = true
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_value, new_value, is_admin_change)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      userId,
      action,
      entityType,
      entityId,
      JSON.stringify(oldValue ?? null),
      JSON.stringify(newValue ?? null),
      isAdminChange ? 1 : 0
    )
    .run();
}

export type AppBindings = { Bindings: Env };
