import React from 'react';
import { formatDate } from '../helpers/types';
import { fromEasternDateTimeInput } from '../helpers/taskDateTime';
import { QUIET_HOURS_LABEL, reminderDeliveryPreviews } from '../helpers/reminderQuietHours';

const parseHours = (value: string) => Array.from(new Set(value.split(',')
  .map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0)));

const policyText = 'Reminders due during quiet hours are moved to 8:00 AM, or to 8:00 PM the previous evening when the task starts before morning delivery is possible.';
export const ReminderQuietHoursPolicy: React.FC = () => <details className="reminder-quiet-policy"><summary>WhatsApp reminder policy · Quiet hours {QUIET_HOURS_LABEL}</summary><p>{policyText}</p><p>Times shown on tasks are approximate delivery previews, not delivery confirmations.</p></details>;

const ReminderDeliveryNotice: React.FC<{ startValue: string; reminderValue: string; compact?: boolean }> = ({ startValue, reminderValue, compact = false }) => {
  const start = startValue ? fromEasternDateTimeInput(startValue) : null;
  const hours = parseHours(reminderValue);
  const previews = start && !Number.isNaN(start.getTime()) ? reminderDeliveryPreviews(start, hours) : [];
  if (compact) return previews.length ? <div className="reminder-delivery-compact">{previews.map(preview => <div key={preview.hoursBefore}>
    <span>{previews.length > 1 ? `${preview.hoursBefore}h reminder` : 'Reminder'}: {preview.unavailable ? 'No upcoming delivery window' : `approximately ${preview.deliveryAt.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`}</span>
    {(preview.adjusted || preview.unavailable) && <details className="reminder-adjustment"><summary>{preview.unavailable ? 'Timing details' : 'Adjusted for quiet hours'}</summary><p>{preview.reason || 'The delivery time has passed, or no permitted delivery window remains before this task starts.'}</p></details>}
  </div>)}</div> : null;
  return <div className="reminder-delivery-notice">
    <strong>WhatsApp quiet hours: {QUIET_HOURS_LABEL}</strong>
    <span>{policyText}</span>
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
