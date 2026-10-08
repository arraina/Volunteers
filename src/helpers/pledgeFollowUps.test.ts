jest.mock('../config/firebase', () => ({ db: {} }));
import { validateFollowUp } from './pledgeFollowUps';

test('follow-ups require a title and valid due time, with bounded details', () => {
  const due = new Date('2026-10-10T12:00:00Z');
  expect(validateFollowUp('Call donor', 'Discuss installments', due)).toBe('');
  expect(validateFollowUp('  ', '', due)).not.toBe('');
  expect(validateFollowUp('x'.repeat(181), '', due)).not.toBe('');
  expect(validateFollowUp('Call', 'x'.repeat(5001), due)).not.toBe('');
  expect(validateFollowUp('Call', '', new Date('invalid'))).not.toBe('');
});
