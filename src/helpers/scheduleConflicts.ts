import { VolunteerTask } from './types';

export interface TaskScheduleConflict {
  first: VolunteerTask;
  second: VolunteerTask;
}

const effectiveEnd = (task: VolunteerTask): number => {
  const start = task.startDateTime.getTime();
  const end = task.endDateTime?.getTime();
  return end && end > start ? end : start;
};

export function findTaskScheduleConflicts(tasks: VolunteerTask[]): TaskScheduleConflict[] {
  const ordered = [...tasks].sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
  const conflicts: TaskScheduleConflict[] = [];

  for (let firstIndex = 0; firstIndex < ordered.length; firstIndex += 1) {
    const first = ordered[firstIndex];
    const firstStart = first.startDateTime.getTime();
    const firstEnd = effectiveEnd(first);

    for (let secondIndex = firstIndex + 1; secondIndex < ordered.length; secondIndex += 1) {
      const second = ordered[secondIndex];
      const secondStart = second.startDateTime.getTime();
      const secondEnd = effectiveEnd(second);
      const sameStart = firstStart === secondStart;
      const overlaps = firstStart < secondEnd && secondStart < firstEnd;
      const pointFallsInsideRange = (firstEnd === firstStart && firstStart > secondStart && firstStart < secondEnd)
        || (secondEnd === secondStart && secondStart > firstStart && secondStart < firstEnd);

      if (sameStart || overlaps || pointFallsInsideRange) conflicts.push({ first, second });
    }
  }

  return conflicts;
}
