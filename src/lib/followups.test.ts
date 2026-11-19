import { describe, expect, it } from 'vitest';
import { detectPeople, dueDate, dueFollowUps, mergeFollowUps, newFollowUp, parseFollowUps, renderFollowUpsMd, serializeFollowUps, upcomingFollowUps } from './followups';

// Made-up sample data.
describe('follow-ups', () => {
  it('works out when to ask', () => {
    expect(dueDate('2026-11-18', 'tomorrow')).toBe('2026-11-19');
    expect(dueDate('2026-11-18', 'this-week')).toBe('2026-11-22');
    expect(dueDate('2026-11-22', 'this-week')).toBe('2026-11-29'); // said on a Sunday
    expect(dueDate('2026-11-18', 'next-week')).toBe('2026-11-29');
    expect(dueDate('2026-11-18', 'two-weeks')).toBe('2026-12-02');
  });
  it('finds people by whole name, any case', () => {
    expect(detectPeople('call priya and Sam tonight', ['Priya', 'Sam', 'Arun'])).toEqual(['Priya', 'Sam']);
    expect(detectPeople('bought a Samsung', ['Sam'])).toEqual([]);
  });
  it('merges by id and sorts due vs upcoming', () => {
    const a = newFollowUp('Call Priya', '2026-11-16', '2026-11-18', ['Priya'], undefined, 'a');
    const b = newFollowUp('Gym 3x', '2026-11-16', '2026-11-29', [], undefined, 'b');
    let f = mergeFollowUps(parseFollowUps(null), [a, b]);
    expect(dueFollowUps(f, '2026-11-18').map((x) => x.id)).toEqual(['a']);
    expect(upcomingFollowUps(f, '2026-11-18').map((x) => x.id)).toEqual(['b']);
    f = mergeFollowUps(f, [{ ...a, status: 'done', outcome: 'We planned the trip.', closed: '2026-11-18' }]);
    expect(f.items).toHaveLength(2);
    expect(dueFollowUps(f, '2026-11-18')).toEqual([]);
    const back = parseFollowUps(serializeFollowUps(f));
    expect(back.items.find((x) => x.id === 'a')?.outcome).toBe('We planned the trip.');
    const md = renderFollowUpsMd(f);
    expect(md).toContain('- [ ] Gym 3x: ask on Sun 29 Nov 2026');
    expect(md).toContain('- [x] Call Priya (with Priya): **Done** on Wed 18 Nov 2026. We planned the trip.');
  });
  it('ignores a broken file instead of crashing', () => {
    expect(parseFollowUps('{not json').items).toEqual([]);
    expect(parseFollowUps('{"items":[{"id":1}]}').items).toEqual([]);
  });
});
