import { taskEventLink } from './taskEventLink';
test('event links can be preserved, assigned, or cleared without altering other task fields', () => {
  expect(taskEventLink(undefined)).toEqual({});
  expect(taskEventLink('event', { name: 'Vijay Dasami' })).toEqual({ eventId: 'event', eventName: 'Vijay Dasami' });
  expect(taskEventLink('')).toEqual({ eventId: null, eventName: null });
  expect(taskEventLink(null)).toEqual({ eventId: null, eventName: null });
  expect(() => taskEventLink('missing')).toThrow('unavailable');
});
