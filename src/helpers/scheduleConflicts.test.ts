import { findTaskScheduleConflicts } from './scheduleConflicts';
import { VolunteerTask } from './types';

const task = (id: string, start: string, end?: string) => ({
  id,
  title: id,
  startDateTime: new Date(start),
  endDateTime: end ? new Date(end) : undefined,
} as VolunteerTask);

describe('findTaskScheduleConflicts', () => {
  it('finds overlapping ranges and identical starts', () => {
    const conflicts = findTaskScheduleConflicts([
      task('a', '2026-09-14T13:00:00Z', '2026-09-14T15:00:00Z'),
      task('b', '2026-09-14T14:00:00Z', '2026-09-14T16:00:00Z'),
      task('c', '2026-09-14T13:00:00Z'),
    ]);
    expect(conflicts.map(({ first, second }) => [first.id, second.id])).toEqual([
      ['a', 'c'],
      ['a', 'b'],
    ]);
  });

  it('does not flag tasks that only touch at an endpoint', () => {
    expect(findTaskScheduleConflicts([
      task('a', '2026-09-14T13:00:00Z', '2026-09-14T14:00:00Z'),
      task('b', '2026-09-14T14:00:00Z', '2026-09-14T15:00:00Z'),
    ])).toHaveLength(0);
  });

  it('finds a start-only task inside a timed task', () => {
    expect(findTaskScheduleConflicts([
      task('a', '2026-09-14T13:00:00Z', '2026-09-14T15:00:00Z'),
      task('b', '2026-09-14T14:00:00Z'),
    ])).toHaveLength(1);
  });
});
