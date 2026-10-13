import React, { useState } from 'react';
import { useAuth } from '../helpers/useAuth';
import { VolunteerTask } from '../helpers/types';
import { taskShareText, taskShareUrl } from '../helpers/taskShare';
import { canShareTask } from '../helpers/taskAccess';
const TaskShareControls: React.FC<{ task: VolunteerTask }> = ({ task }) => {
  const { user, isOwner, isAdmin } = useAuth();
  const [showLink, setShowLink] = useState(false); const [copied, setCopied] = useState(false);
  if (!canShareTask(user?.uid, isOwner, isAdmin, task.createdBy) || task.deleted) return null;
  const url = taskShareUrl(task.id);
  return <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
    <button type="button" className="secondary-btn" onClick={async () => { setShowLink(true); try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Link copied' : 'Copy task link'}</button>
    <a className="secondary-btn" href={`https://wa.me/?text=${encodeURIComponent(taskShareText(task))}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
    {showLink && <label className="small">Task link (sign-in required)<input readOnly value={url} onFocus={event => event.currentTarget.select()} aria-label="Shareable task link" /></label>}
  </span>;
};
export default TaskShareControls;
