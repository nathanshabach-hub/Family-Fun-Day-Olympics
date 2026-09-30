import { describe, expect, it } from 'vitest';
import { canJudgeEdit, validateScoreValue } from '../worker/routes/scores';

describe('scoring rules', () => {
  const baseSettings = {
    event_status: 'LIVE' as const,
    minimum_score: 0,
    maximum_score: 10,
    score_step: 'INTEGER' as const,
    scoring_locked: 0,
    judges_can_edit: 1,
  };

  it('allows judge edits only when live and unlocked', () => {
    expect(canJudgeEdit(baseSettings)).toBe(true);
    expect(canJudgeEdit({ ...baseSettings, scoring_locked: 1 })).toBe(false);
    expect(canJudgeEdit({ ...baseSettings, judges_can_edit: 0 })).toBe(false);
    expect(canJudgeEdit({ ...baseSettings, event_status: 'FINISHED' })).toBe(false);
  });

  it('validates integer score range', () => {
    expect(validateScoreValue(8, baseSettings)).toBeNull();
    expect(validateScoreValue(-1, baseSettings)).toContain('between 0 and 10');
    expect(validateScoreValue(11, baseSettings)).toContain('between 0 and 10');
    expect(validateScoreValue(7.5, baseSettings)).toContain('between 0 and 10');
  });

  it('allows decimals when score step is decimal', () => {
    const decimalSettings = { ...baseSettings, score_step: 'DECIMAL' as const };
    expect(validateScoreValue(7.5, decimalSettings)).toBeNull();
  });
});
