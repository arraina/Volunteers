jest.mock('../config/firebase', () => ({ db: {} }));
import { validateFollowUp } from './pledgeFollowUps';

test('follow-ups require a title and valid due time, with bounded details', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-16T12:00:00Z'));
  const due = new Date('2026-10-17T12:00:00Z');
  expect(validateFollowUp('Call donor', 'Discuss installments', due)).toBe('');
  expect(validateFollowUp('  ', '', due)).not.toBe('');
  expect(validateFollowUp('x'.repeat(181), '', due)).not.toBe('');
  expect(validateFollowUp('Call', 'x'.repeat(5001), due)).not.toBe('');
  expect(validateFollowUp('Call', '', new Date('invalid'))).not.toBe('');
  expect(validateFollowUp('Call', '', new Date('1927-10-04T23:04:00Z'))).toContain('four-digit');
  expect(validateFollowUp('Call', '', new Date('2027-10-04T23:04:00Z'))).toBe('');
  expect(validateFollowUp('Call', '', new Date('2200-01-01T12:00:00Z'))).not.toBe('');
  expect(validateFollowUp('Call', '', new Date('2026-10-16T11:59:59Z'))).toContain('future');
  expect(validateFollowUp('Call', '', new Date('2026-10-16T12:00:00Z'))).toContain('future');
  jest.useRealTimers();
});
