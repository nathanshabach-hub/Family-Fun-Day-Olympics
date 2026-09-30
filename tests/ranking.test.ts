import { describe, expect, it } from 'vitest';
import { calculateLeaderboard } from '../worker/services/ranking';

describe('ranking service', () => {
  it('calculates totals and ranking order', () => {
    const teams = [
      { id: 1, teamCode: 'TEAM-001', displayName: 'A Team' },
      { id: 2, teamCode: 'TEAM-002', displayName: 'B Team' },
    ];

    const activities = [
      { id: 1, name: 'Race' },
      { id: 2, name: 'Relay' },
    ];

    const scores = [
      { teamId: 1, activityId: 1, judgeId: 1, score: 10 },
      { teamId: 1, activityId: 1, judgeId: 2, score: 9 },
      { teamId: 1, activityId: 1, judgeId: 3, score: 8 },
      { teamId: 2, activityId: 1, judgeId: 1, score: 8 },
      { teamId: 2, activityId: 1, judgeId: 2, score: 8 },
      { teamId: 2, activityId: 1, judgeId: 3, score: 8 },
      { teamId: 1, activityId: 2, judgeId: 1, score: 7 },
      { teamId: 1, activityId: 2, judgeId: 2, score: 7 },
      { teamId: 1, activityId: 2, judgeId: 3, score: 7 },
      { teamId: 2, activityId: 2, judgeId: 1, score: 9 },
      { teamId: 2, activityId: 2, judgeId: 2, score: 9 },
      { teamId: 2, activityId: 2, judgeId: 3, score: 9 },
    ];

    const result = calculateLeaderboard(teams, activities, scores);
    expect(result.rows[0].teamName).toBe('B Team');
    expect(result.rows[0].overallTotal).toBe(51);
    expect(result.rows[1].overallTotal).toBe(48);
  });

  it('uses activity wins as first tie-breaker', () => {
    const teams = [
      { id: 1, teamCode: 'TEAM-001', displayName: 'Alpha' },
      { id: 2, teamCode: 'TEAM-002', displayName: 'Beta' },
    ];

    const activities = [
      { id: 1, name: 'A1' },
      { id: 2, name: 'A2' },
      { id: 3, name: 'A3' },
      { id: 4, name: 'A4' },
    ];

    const scores = [
      { teamId: 1, activityId: 1, judgeId: 1, score: 9 },
      { teamId: 1, activityId: 1, judgeId: 2, score: 9 },
      { teamId: 1, activityId: 1, judgeId: 3, score: 9 },
      { teamId: 2, activityId: 1, judgeId: 1, score: 8 },
      { teamId: 2, activityId: 1, judgeId: 2, score: 8 },
      { teamId: 2, activityId: 1, judgeId: 3, score: 8 },

      { teamId: 1, activityId: 2, judgeId: 1, score: 9 },
      { teamId: 1, activityId: 2, judgeId: 2, score: 9 },
      { teamId: 1, activityId: 2, judgeId: 3, score: 9 },
      { teamId: 2, activityId: 2, judgeId: 1, score: 8 },
      { teamId: 2, activityId: 2, judgeId: 2, score: 8 },
      { teamId: 2, activityId: 2, judgeId: 3, score: 8 },

      { teamId: 1, activityId: 3, judgeId: 1, score: 9 },
      { teamId: 1, activityId: 3, judgeId: 2, score: 9 },
      { teamId: 1, activityId: 3, judgeId: 3, score: 9 },
      { teamId: 2, activityId: 3, judgeId: 1, score: 8 },
      { teamId: 2, activityId: 3, judgeId: 2, score: 8 },
      { teamId: 2, activityId: 3, judgeId: 3, score: 8 },

      { teamId: 1, activityId: 4, judgeId: 1, score: 0 },
      { teamId: 1, activityId: 4, judgeId: 2, score: 0 },
      { teamId: 1, activityId: 4, judgeId: 3, score: 0 },
      { teamId: 2, activityId: 4, judgeId: 1, score: 3 },
      { teamId: 2, activityId: 4, judgeId: 2, score: 3 },
      { teamId: 2, activityId: 4, judgeId: 3, score: 3 },
    ];

    const result = calculateLeaderboard(teams, activities, scores);
    expect(result.rows[0].overallTotal).toBe(result.rows[1].overallTotal);
    expect(result.rows[0].activityWins).toBeGreaterThan(result.rows[1].activityWins);
    expect(result.rows[0].teamName).toBe('Alpha');
  });

  it('applies competition ranking for unresolved ties', () => {
    const teams = [
      { id: 1, teamCode: 'TEAM-001', displayName: 'Alpha' },
      { id: 2, teamCode: 'TEAM-002', displayName: 'Beta' },
      { id: 3, teamCode: 'TEAM-003', displayName: 'Gamma' },
    ];

    const activities = [{ id: 1, name: 'A1' }];

    const scores = [
      { teamId: 1, activityId: 1, judgeId: 1, score: 10 },
      { teamId: 1, activityId: 1, judgeId: 2, score: 10 },
      { teamId: 1, activityId: 1, judgeId: 3, score: 10 },

      { teamId: 2, activityId: 1, judgeId: 1, score: 10 },
      { teamId: 2, activityId: 1, judgeId: 2, score: 10 },
      { teamId: 2, activityId: 1, judgeId: 3, score: 10 },

      { teamId: 3, activityId: 1, judgeId: 1, score: 9 },
      { teamId: 3, activityId: 1, judgeId: 2, score: 9 },
      { teamId: 3, activityId: 1, judgeId: 3, score: 9 },
    ];

    const result = calculateLeaderboard(teams, activities, scores);
    expect(result.rows[0].rank).toBe(1);
    expect(result.rows[1].rank).toBe(1);
    expect(result.rows[2].rank).toBe(3);
    expect(result.rows[0].tied).toBe(true);
    expect(result.rows[1].tied).toBe(true);
  });
});
