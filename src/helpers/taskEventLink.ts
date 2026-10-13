export function taskEventLink(eventId: string | null | undefined, event?: { name: string }): { eventId?: string | null; eventName?: string | null } {
  if (eventId === undefined) return {};
  if (!eventId) return { eventId: null, eventName: null };
  if (!event?.name) throw new Error('The selected event is unavailable. Choose another event.');
  return { eventId, eventName: event.name };
}
