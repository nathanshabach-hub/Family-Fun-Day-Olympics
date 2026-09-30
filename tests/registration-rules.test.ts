import { describe, expect, it } from 'vitest';
import { hasCapacity, summarizeRegistration } from '../worker/services/registration';

describe('registration rules', () => {
  it('reports open registration with available spaces', () => {
    const summary = summarizeRegistration(8, 3, 'OPEN');
    expect(summary.registrationOpen).toBe(true);
    expect(summary.spacesRemaining).toBe(5);
    expect(summary.message).toBe('Registration is open.');
  });

  it('reports full registration when max reached', () => {
    const summary = summarizeRegistration(6, 6, 'OPEN');
    expect(summary.registrationOpen).toBe(false);
    expect(summary.registrationStatus).toBe('CLOSED');
    expect(summary.message).toBe('Registration Full');
  });

  it('reports closed registration when event is manually closed', () => {
    const summary = summarizeRegistration(10, 4, 'CLOSED');
    expect(summary.registrationOpen).toBe(false);
    expect(summary.message).toBe('Registration is currently closed.');
  });

  it('enforces capacity check correctly', () => {
    expect(hasCapacity(6, 5)).toBe(true);
    expect(hasCapacity(6, 6)).toBe(false);
    expect(hasCapacity(6, 9)).toBe(false);
  });
});
