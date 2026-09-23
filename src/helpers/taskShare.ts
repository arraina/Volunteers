import { VolunteerTask, formatDate, openSlots } from './types';

export function taskShareUrl(taskId: string): string {
  const base = window.location.pathname.startsWith('/Volunteers') ? '/Volunteers' : '';
  return `${window.location.origin}${base}/task/${encodeURIComponent(taskId)}`;
}

function taskShareSummary(task: VolunteerTask): string {
  const lines = [
    `Volunteer opportunity: ${task.title}`,
    formatDate(task.startDateTime),
    task.location || '',
    `${openSlots(task)} volunteer spot${openSlots(task) === 1 ? '' : 's'} open`,
  ];
  return lines.filter(Boolean).join('\n');
}

export function taskShareText(task: VolunteerTask): string {
  return `${taskShareSummary(task)}\nOpen the link to review and sign up:\n${taskShareUrl(task.id)}`;
}

export async function shareTask(task: VolunteerTask): Promise<'shared' | 'whatsapp'> {
  const url = taskShareUrl(task.id);
  const text = taskShareText(task);
  if (navigator.share) {
    try {
      await navigator.share({ title: task.title, text: taskShareSummary(task), url });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  return 'whatsapp';
}
