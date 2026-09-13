import React from 'react';
import { Link } from 'react-router-dom';
import './PrivacyPolicy.css';

const PrivacyPolicy: React.FC = () => (
  <main className="privacy-page">
    <article className="privacy-card">
      <header className="privacy-header">
        <p className="privacy-eyebrow">ISKCON of New Jersey · Towaco</p>
        <h1>Volunteer Management System Privacy Policy</h1>
        <p>Effective September 13, 2026</p>
      </header>

      <p>
        This policy explains how the ISKCON of New Jersey Volunteer Management System
        (the “Application”) collects, uses, shares, and protects information about
        volunteers, administrators, and owners who use it.
      </p>

      <h2>Information we collect</h2>
      <p>The Application may collect and maintain:</p>
      <ul>
        <li>Name, email address, telephone number, and account identifiers.</li>
        <li>Skills, usual availability, participation status, and notification preferences.</li>
        <li>Task assignments, event participation, check-in records, service hours, and feedback.</li>
        <li>Planning notes and other information entered by authorized administrators.</li>
        <li>Login and security audit information, such as date and time, role, browser, platform, and timezone.</li>
        <li>Notification records, including whether a reminder was accepted, sent, delivered, read, or failed when a provider supplies that status.</li>
      </ul>

      <h2>How we use information</h2>
      <p>We use this information to:</p>
      <ul>
        <li>Register and authenticate users and administer access.</li>
        <li>Plan temple events, staff volunteer tasks, and coordinate service activities.</li>
        <li>Send requested task reminders and operational communications by WhatsApp, email, or browser notification.</li>
        <li>Record volunteer service, improve planning, troubleshoot delivery, secure the Application, and maintain an audit history.</li>
        <li>Prepare operational and application-value reports for authorized temple leadership.</li>
      </ul>

      <h2>WhatsApp communications</h2>
      <p>
        WhatsApp reminders are sent only when a telephone number and the applicable
        notification preference or consent are recorded. Messages may include a volunteer’s
        first name and the assigned task’s title, date, time, and location. Message delivery
        is processed through Meta’s WhatsApp Business Platform. Volunteers can change their
        reminder preference in their profile or contact us for assistance. Carrier or data
        charges imposed by a volunteer’s provider may apply.
      </p>

      <h2>How information is shared</h2>
      <p>
        Information is available to authorized users according to their role. We also use
        service providers needed to operate the Application, including Google Firebase for
        authentication, database, hosting, and server functions; Meta for WhatsApp Business
        messages; and configured email or browser-notification providers. These providers
        process relevant information under their own terms and privacy policies. We do not
        sell personal information or use volunteer information for third-party advertising.
        We may disclose information when required by law or necessary to protect users, the
        temple, or the Application.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        We retain information for as long as reasonably needed for volunteer coordination,
        service history, security, reporting, legal obligations, and dispute prevention.
        Some deleted operational records may remain temporarily recoverable before permanent
        deletion, and limited historical or audit information may be retained where necessary.
        To request access, correction, or deletion of personal information, contact us using
        the address below. We may need to verify the requester’s identity and may retain
        information when required or permitted by law.
      </p>

      <h2>Security and children</h2>
      <p>
        We use role-based access controls and reasonable administrative and technical measures
        to protect information. No system can guarantee absolute security. The Application is
        intended for authorized temple volunteers and is not directed to children under 13.
      </p>

      <h2>Your choices</h2>
      <p>
        Users may review and update available profile fields and notification preferences in
        the Application. Users may also request assistance with correcting information,
        stopping WhatsApp reminders, or deleting an account by contacting us.
      </p>

      <h2>Policy changes</h2>
      <p>
        We may update this policy as the Application or our practices change. The effective
        date above will be revised when a material update is published.
      </p>

      <h2>Contact us</h2>
      <address>
        International Society for Krishna Consciousness of New Jersey<br />
        Towaco, New Jersey, United States<br />
        Email: <a href="mailto:info@iskconofnewjersey.org">info@iskconofnewjersey.org</a>
      </address>

      <footer className="privacy-footer">
        <Link to="/login">Return to Volunteer Management System</Link>
      </footer>
    </article>
  </main>
);

export default PrivacyPolicy;
