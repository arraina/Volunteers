import React from 'react';
import { formatDate } from '../helpers/types';
import { fromEasternDateTimeInput } from '../helpers/taskDateTime';
import { QUIET_HOURS_LABEL, reminderDeliveryPreviews } from '../helpers/reminderQuietHours';

const parseHours = (value: string) => Array.from(new Set(value.split(',')
  .map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0)));

const ReminderDeliveryNotice: React.FC<{ startValue: string; reminderValue: string }> = ({ startValue, reminderValue }) => {
  const start = startValue ? fromEasternDateTimeInput(startValue) : null;
  const hours = parseHours(reminderValue);
  const previews = start && !Number.isNaN(start.getTime()) ? reminderDeliveryPreviews(start, hours) : [];
  return <div className="reminder-delivery-notice">
    <strong>WhatsApp quiet hours: {QUIET_HOURS_LABEL}</strong>
    <span>Reminders due during quiet hours are moved to 8:00 AM, or to 8:00 PM the previous evening when the task starts before morning delivery is possible.</span>
    {previews.length > 0 && <ul>
      {previews.map((preview) => <li key={preview.hoursBefore}>
        {preview.hoursBefore} hour(s) before: {preview.unavailable
          ? `cannot be delivered automatically (${preview.reason || 'no permitted delivery window remains'})`
          : `${preview.adjusted ? 'adjusted to' : 'expected'} approximately ${formatDate(preview.deliveryAt)}${preview.reason ? ` — ${preview.reason}` : ''}`}
      </li>)}
    </ul>}
  </div>;
};

export default ReminderDeliveryNotice;
