import React from 'react';
jest.mock('../config/firebase', () => ({ db: {} }));
import { render, screen } from '@testing-library/react';
import ReminderDeliveryNotice, { ReminderQuietHoursPolicy } from './ReminderDeliveryNotice';
test('compact task reminders omit the repeated policy box', () => {
  const { container } = render(<ReminderDeliveryNotice compact startValue="2040-10-24T15:30" reminderValue="24" />);
  expect(screen.getByText(/Reminder: approximately/)).toBeTruthy();
  expect(container.querySelector('.reminder-delivery-notice')).toBeNull();
  expect(screen.queryByText(/WhatsApp quiet hours:/)).toBeNull();
});
test('quiet-hours adjustment has expandable details', () => {
  render(<ReminderDeliveryNotice compact startValue="2040-10-24T07:00" reminderValue="24" />);
  expect(screen.getByText('Adjusted for quiet hours')).toBeTruthy();
});
test('policy is collapsible and full guidance remains in editors', () => {
  const { container } = render(<><ReminderQuietHoursPolicy /><ReminderDeliveryNotice startValue="2040-10-24T15:30" reminderValue="24" /></>);
  expect(container.querySelector('.reminder-quiet-policy')?.hasAttribute('open')).toBe(false);
  expect(screen.getByText(/WhatsApp quiet hours:/)).toBeTruthy();
});
