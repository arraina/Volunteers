import { canShareTask } from './taskAccess';
test('only the Owner or the admin who created a task sees sharing controls', () => {
  expect(canShareTask('owner', true, true, 'other')).toBe(true);
  expect(canShareTask('admin', false, true, 'admin')).toBe(true);
  expect(canShareTask('admin', false, true, 'other')).toBe(false);
  expect(canShareTask('admin', false, true, undefined)).toBe(false);
  expect(canShareTask('volunteer', false, false, 'volunteer')).toBe(false);
  expect(canShareTask(undefined, true, true, 'owner')).toBe(false);
});
