import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Auth.css';

const ClaimLinkSent: React.FC = () => {
  const location = useLocation();
  const recentlySent = (location.state as { recentlySent?: boolean } | null)?.recentlySent === true;

  return <div className="auth-page">
    <main className="auth-card">
      <div className="auth-card-inner">
        <h1>Your volunteer profile is ready to activate</h1>
        <div className="success-message">
          {recentlySent
            ? 'A secure activation link was recently sent to your WhatsApp number.'
            : 'We sent a new secure activation link to your WhatsApp number.'}
        </div>
        <p>Open that WhatsApp message and tap the link. Then enter your email and password to activate your existing profile. Your assignments will remain attached.</p>
        <p className="muted small">For your security, the link can be used once and expires after 7 days.</p>
        <Link className="primary-btn" to="/login">Back to login</Link>
      </div>
    </main>
  </div>;
};

export default ClaimLinkSent;
