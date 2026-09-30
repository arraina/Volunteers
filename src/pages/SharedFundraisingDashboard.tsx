import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FundraisingCampaign, getEvents, subscribeFundraisingCampaign } from '../helpers/store';
import { useAuth } from '../helpers/useAuth';
import './AdminDashboard.css';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const SPOTLIGHT_DISPLAY_SECONDS = 6;

const donorName = (firstName: string, lastName: string) =>
  [firstName, lastName].filter(Boolean).join(' ') || 'Anonymous';

const SharedFundraisingDashboard: React.FC = () => {
  const { eventId = '' } = useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<FundraisingCampaign | null>(null);
  const [eventName, setEventName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [spotlightCycle, setSpotlightCycle] = useState(0);

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    setLoading(true);
    setLoadError('');
    getEvents()
      .then((events) => {
        if (active) setEventName(events.find((event) => event.id === eventId)?.name || '');
      })
      .catch(() => undefined);
    const unsubscribe = subscribeFundraisingCampaign(eventId, (nextCampaign) => {
      if (!active) return;
      setCampaign(nextCampaign);
      setLoading(false);
    }, () => {
      if (!active) return;
      setLoadError('This dashboard could not be loaded. Sign in with a verified volunteer account, or ask an administrator to check your profile access.');
      setLoading(false);
    });
    return () => { active = false; unsubscribe(); };
  }, [eventId]);

  const entries = campaign?.entries || [];
  const entryTotal = useMemo(() => entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0), [entries]);
  const current = Math.max(0, campaign?.startingCurrentAmount || 0) + entryTotal;
  const target = Math.max(0, campaign?.targetAmount || 0);
  const percent = target > 0 ? current / target * 100 : 0;
  const remaining = Math.max(0, target - current);
  const donors = entries.filter((entry) => entry.firstName.trim() || entry.lastName.trim() || entry.amount > 0);
  const threshold = campaign?.spotlightThreshold || 15000;
  const gapSeconds = Math.max(0, campaign?.spotlightGapSeconds ?? 18);
  const spotlightDonors = donors.filter((entry) => entry.amount >= threshold);
  const spotlightSignature = spotlightDonors.map((entry) => `${entry.id}:${entry.amount}:${entry.firstName}:${entry.lastName}`).join('|');

  useEffect(() => {
    setSpotlightCycle(0);
    if (!spotlightDonors.length) return;
    const timer = window.setInterval(() => setSpotlightCycle((currentCycle) => currentCycle + 1), (SPOTLIGHT_DISPLAY_SECONDS + gapSeconds) * 1000);
    return () => window.clearInterval(timer);
  }, [spotlightSignature, gapSeconds]);

  if (loading) return <div className="loading">Loading fundraising dashboard…</div>;

  return <main className="fundraising-readonly-page">
    <div className="fundraising-readonly-toolbar">
      <div><strong>Fundraising dashboard</strong><span>Read-only view</span></div>
      <button className="secondary-btn" onClick={() => navigate(isAdmin ? '/admin' : '/dashboard')}>Go to my dashboard</button>
    </div>
    {loadError ? <section className="panel empty-state"><strong>Unable to load dashboard</strong><span>{loadError}</span></section> : !campaign ? <section className="panel empty-state"><strong>Dashboard not found</strong><span>The link may be incorrect, or this fundraising dashboard has not been saved yet.</span></section> : <div className="fundraising-dashboard">
      <section className="fundraising-hero"><div><p className="fundraising-kicker">Fundraising dashboard</p><h2>{campaign.dashboardName || eventName || 'Fundraising'}</h2></div></section>
      <section className="fundraising-donor-ticker" aria-label="Donor names and amounts">
        <div className={`fundraising-donor-ticker-track ${donors.length ? '' : 'is-empty'}`}>
          <div className="fundraising-donor-ticker-group">
            {donors.length ? donors.map((entry) => <span key={`primary-${entry.id}`}><strong>{donorName(entry.firstName, entry.lastName)}</strong><b>{money.format(entry.amount)}</b></span>) : <span><strong>Donors will appear here as entries are added</strong></span>}
          </div>
          {donors.length > 0 && <div className="fundraising-donor-ticker-group" aria-hidden="true">
            {donors.map((entry) => <span key={`repeat-${entry.id}`}><strong>{donorName(entry.firstName, entry.lastName)}</strong><b>{money.format(entry.amount)}</b></span>)}
          </div>}
        </div>
      </section>
      <section className={`fundraising-display-board ${percent >= 100 ? 'goal-reached' : ''}`}>
        {spotlightDonors.length > 0 && <div className="fundraising-donor-spotlight" key={`${spotlightDonors[spotlightCycle % spotlightDonors.length].id}-${spotlightCycle}`} aria-live="polite">
          <span>Donor spotlight</span>
          <strong>{donorName(spotlightDonors[spotlightCycle % spotlightDonors.length].firstName, spotlightDonors[spotlightCycle % spotlightDonors.length].lastName)}</strong>
          <b>{money.format(spotlightDonors[spotlightCycle % spotlightDonors.length].amount)}</b>
        </div>}
        <div className="fundraising-contribution-board">
          <div className="fundraising-board-label">Donors</div>
          <div className="fundraising-supporter-list">
            {donors.length ? donors.map((entry) => <div className="fundraising-supporter" key={entry.id}><span><strong>{donorName(entry.firstName, entry.lastName)}</strong><small>{entry.type}</small></span><b>{money.format(entry.amount)}</b></div>) : <p className="fundraising-empty-supporters">Donors will appear here.</p>}
          </div>
        </div>
        <div className="fundraising-goal-meter" role="progressbar" aria-label="Fundraising progress" aria-valuemin={0} aria-valuemax={Math.max(target, current)} aria-valuenow={current}>
          <div className="fundraising-meter-scale"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
          <div className="fundraising-meter-track"><div className="fundraising-meter-fill" style={{ height: `${Math.min(100, percent)}%` }} /><strong>{Math.round(percent)}%</strong></div>
          <span className="fundraising-meter-caption">Goal progress</span>
        </div>
        <div className="fundraising-scorecards">
          <div><span>Target</span><strong>{money.format(target)}</strong></div>
          <div><span>Current</span><strong>{money.format(current)}</strong><small>{percent >= 100 ? `${money.format(current - target)} above goal` : `${money.format(remaining)} to go`}</small></div>
          <div><span>Progress</span><strong>{Math.round(percent)}%</strong></div>
          <div><span>Donors</span><strong>{donors.length}</strong></div>
        </div>
        {percent >= 100 && <div className="fundraising-board-celebration">Goal reached!</div>}
      </section>
    </div>}
  </main>;
};

export default SharedFundraisingDashboard;
