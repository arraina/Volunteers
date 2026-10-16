import React from 'react';
import { Link } from 'react-router-dom';
import './PrivacyPolicy.css';

const TermsOfUse: React.FC = () => (
  <main className="privacy-page">
    <article className="privacy-card">
      <header className="privacy-header">
        <p className="privacy-eyebrow">ISKCON Parsippany Community Hub</p>
        <h1>Community Hub Terms of Use</h1>
        <p>Effective October 16, 2026</p>
      </header>

      <p>
        These Terms of Use govern access to and use of the ISKCON Parsippany Community Hub
        (the “Application”), operated for the International Society for Krishna Consciousness
        of New Jersey. By accessing or using the Application, you agree to these terms. If you
        do not agree, do not use the Application.
      </p>

      <h2>Purpose and authorized use</h2>
      <p>
        The Application supports temple administration, volunteer coordination, fundraising,
        operational reporting, and related community activities. You may use it only for
        authorized temple purposes and only with an account and permissions assigned to you.
        You may not attempt to access records, functions, or accounts for which you have not
        been authorized.
      </p>

      <h2>Accounts and security</h2>
      <p>
        You are responsible for safeguarding your login credentials, using multi-factor
        authentication when required, and promptly reporting suspected unauthorized access.
        You must provide accurate account information and must not share an account or
        impersonate another person. Access may be suspended or revoked to protect the temple,
        its users, or its data.
      </p>

      <h2>Financial information and QuickBooks</h2>
      <p>
        Authorized users may connect the Application to QuickBooks Online and view financial
        information made available through that connection. QuickBooks and Intuit are
        third-party services governed by their own terms and privacy policies. The Application
        is an operational aid and does not replace the temple’s official accounting records,
        professional accounting advice, tax advice, or required financial controls.
      </p>
      <p>
        Users must verify reports and transactions against the official accounting system
        before relying on them for reconciliation, filing, payment, or other financial action.
        You may not export, disclose, alter, or use financial information except as authorized
        by temple leadership and applicable law.
      </p>

      <h2>User-submitted information</h2>
      <p>
        You are responsible for information you enter or upload and must have permission to
        provide it. Do not enter unlawful, misleading, confidential, or sensitive information
        unless it is necessary for an authorized purpose and the Application is approved to
        hold it. You grant the temple permission to store, process, reproduce, and use submitted
        information as reasonably necessary to operate the Application and temple activities.
      </p>

      <h2>Acceptable conduct</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Application for unlawful, fraudulent, harmful, or unauthorized purposes.</li>
        <li>Interfere with security controls, availability, or normal operation.</li>
        <li>Introduce malicious code or attempt to discover vulnerabilities without permission.</li>
        <li>Collect, copy, or disclose personal or financial information without authorization.</li>
        <li>Use another person’s credentials or circumvent assigned access restrictions.</li>
      </ul>

      <h2>Availability and changes</h2>
      <p>
        The Application is provided on an “as is” and “as available” basis. Features may be
        corrected, changed, suspended, or discontinued. We do not guarantee uninterrupted or
        error-free operation, the availability of third-party services, or that every report
        will be complete or current at all times.
      </p>

      <h2>Disclaimer and limitation of liability</h2>
      <p>
        To the extent permitted by law, the temple and its officers, volunteers, and service
        providers disclaim implied warranties and are not liable for indirect, incidental,
        special, consequential, or punitive damages arising from use of, or inability to use,
        the Application. Nothing in these terms excludes liability that cannot lawfully be
        excluded.
      </p>

      <h2>Privacy</h2>
      <p>
        Our <Link to="/privacy">Privacy Policy</Link> explains how the Application collects,
        uses, shares, retains, and protects information and is incorporated into these terms.
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using the Application at any time. We may restrict or terminate access
        when reasonably necessary for security, compliance, operational needs, violation of
        these terms, or the end of a user’s authorized role. Obligations concerning
        confidentiality, permitted data use, disclaimers, and liability survive termination.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms as the Application, connected services, or legal requirements
        change. The effective date above will be revised when an update is published. Continued
        use after an update constitutes acceptance of the revised terms.
      </p>

      <h2>Contact us</h2>
      <address>
        International Society for Krishna Consciousness of New Jersey<br />
        Towaco, New Jersey, United States<br />
        Email: <a href="mailto:info@iskconofnewjersey.org">info@iskconofnewjersey.org</a>
      </address>

      <footer className="privacy-footer">
        <Link to="/login">Return to Community Hub</Link>
      </footer>
    </article>
  </main>
);

export default TermsOfUse;
