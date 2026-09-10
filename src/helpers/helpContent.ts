export type HelpRole = 'everyone' | 'volunteer' | 'admin' | 'owner';

export interface HelpArticle {
  id: string;
  title: string;
  category: string;
  roles: HelpRole[];
  summary: string;
  sections: Array<{ heading: string; text: string }>;
  keywords: string[];
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'volunteer-quick-start', title: 'How to get started as a new Volunteer', category: 'Quick Start', roles: ['volunteer'],
    summary: 'A first-day checklist from account activation through completing your first service task.',
    sections: [
      { heading: '1. Activate your account', text: 'Self-register with your name, email, phone, and a password for this app, or open the invitation sent by an admin. Confirm your email before signing in. If an invitation link expired, use Forgot password.' },
      { heading: '2. Complete My Profile', text: 'Open My Profile, check your name and phone, select the days you are usually available, and save. Availability is guidance for coordinators; it does not block you from other days.' },
      { heading: '3. Verify your phone', text: 'In My Profile, request an SMS code and enter it when received. Keep WhatsApp enabled so your profile remains active and task reminders can reach you.' },
      { heading: '4. Join a task', text: 'Open Open Tasks, search by event, task, or location, check the date and open places, then choose Sign Up. If the task is full, cancelled, or not open for self-signup, contact an admin.' },
      { heading: '5. Confirm your commitment', text: 'Open My Tasks and verify that the assignment appears. Review the location and time. If plans change, withdraw early where the button is available or contact an admin.' },
      { heading: '6. Serve and record time', text: 'For tasks using hour tracking, check in when service begins and check out when it ends. Confirm that the recorded hours appear correctly.' },
      { heading: '7. Share feedback', text: 'After the event, open Event Feedback, select the event, and write free-flowing comments about what worked and what should improve next time.' },
    ], keywords: ['new volunteer', 'quick start', 'first day', 'onboarding', 'how to begin', 'checklist'],
  },
  {
    id: 'admin-quick-start', title: 'How to get started as a new Admin', category: 'Quick Start', roles: ['admin', 'owner'],
    summary: 'The recommended sequence for setting up people, events, tasks, assignments, and reminders.',
    sections: [
      { heading: '1. Confirm access', text: 'Sign in with a verified email. The header should say Admin or Owner. If you still see the Volunteer dashboard, ask the Owner to verify your Admin access.' },
      { heading: '2. Review volunteers', text: 'Open Volunteers. Search existing records before adding anyone to avoid duplicate logins. Confirm name, email, international phone number, active status, and WhatsApp consent.' },
      { heading: '3. Create the event first', text: 'For an organized program, open Event Workspace and create the event with its correct name, date, and description. Standalone operational tasks can be created without an event.' },
      { heading: '4. Create tasks', text: 'Open Tasks, enter the title and start time, then add end time, location, volunteers needed, signup setting, recurrence, and reminder hours. Link the task to the event when applicable.' },
      { heading: '5. Check every occurrence', text: 'For recurring work, expand the series and verify the generated dates. Each occurrence has its own assignments and capacity.' },
      { heading: '6. Fill coverage gaps', text: 'Assign eligible volunteers from the dropdown or allow self-signup. Watch Open and Need people counts. The assignment control closes automatically when capacity is reached.' },
      { heading: '7. Verify communications', text: 'Before relying on reminders, confirm the volunteer has valid contact information and enabled channels. Review message history for provider or delivery failures.' },
      { heading: '8. Close the learning loop', text: 'Capture meeting decisions before the event, review feedback afterward, save lessons learned, and update an event template if the event will repeat.' },
    ], keywords: ['new admin', 'quick start', 'first day', 'onboarding', 'admin checklist', 'setup workflow'],
  },
  {
    id: 'owner-quick-start', title: 'How to get started as the Owner', category: 'Quick Start', roles: ['owner'],
    summary: 'Secure the application, delegate normal operations, and retain recovery controls.',
    sections: [
      { heading: '1. Confirm Owner access', text: 'Sign in and confirm that the header says Owner and Admin Management is visible. The original bootstrap administrator is treated as the protected Owner.' },
      { heading: '2. Choose trusted Admins', text: 'Ask each coordinator to register first. Open Admin Management, select the correct existing volunteer, verify the displayed email, and choose Give Admin Access.' },
      { heading: '3. Explain the boundary', text: 'Admins perform daily operations and can move tasks to Trash. Only the Owner manages Admin access, restores trashed tasks, and permanently deletes tasks.' },
      { heading: '4. Review access regularly', text: 'Periodically open Admin Management and remove Admin access when a coordinator no longer needs it. Their volunteer profile, assignments, and service history remain.' },
      { heading: '5. Protect recovery', text: 'Review Trash before its 30-day cleanup. Restore mistakes and use Delete permanently only when certain the task record is no longer needed.' },
    ], keywords: ['new owner', 'owner setup', 'quick start', 'admin access', 'security checklist'],
  },
  {
    id: 'how-to-common', title: 'How to perform common actions', category: 'How To', roles: ['everyone'],
    summary: 'Short directions for the actions people use most often.',
    sections: [
      { heading: 'How to change your password', text: 'Sign out, open Log in, choose Forgot password, enter the account email, and follow the emailed link. An admin-created volunteer can use this same process.' },
      { heading: 'How to update your phone', text: 'Open My Profile, replace the phone with its country code, save, then complete SMS verification for the new number.' },
      { heading: 'How to find a task', text: 'Open Open Tasks and type part of the task, event, or location into Search. Adjust filters or sorting if available. Clear filters if an expected task is missing.' },
      { heading: 'How to know you are assigned', text: 'After signup or admin assignment, the task appears under My Tasks and its assigned count increases. If it does not appear, refresh and ask an admin to confirm the saved assignment.' },
      { heading: 'How to stop participating', text: 'Withdraw from future self-signup tasks where allowed and contact an admin about locked assignments. Turning off required WhatsApp makes the profile inactive; it is not a substitute for cancelling one task.' },
      { heading: 'How to get help', text: 'Search this manual or ask the Help Assistant using a specific question. Include the screen name, action attempted, and exact error message. Do not include passwords, SMS codes, or access tokens.' },
    ], keywords: ['how to', 'common actions', 'password', 'update phone', 'find task', 'assigned', 'get help'],
  },
  {
    id: 'how-to-admin-actions', title: 'How to perform common Admin actions', category: 'How To', roles: ['admin', 'owner'],
    summary: 'Step-by-step directions for routine volunteer and task administration.',
    sections: [
      { heading: 'How to add one volunteer', text: 'Open Volunteers. Enter first name, last name, email, and international phone. Confirm WhatsApp consent, then choose Add Volunteer & Send Invitation. Tell the volunteer to check email and set a password.' },
      { heading: 'How to resend an invitation', text: 'Find the person under Volunteers and choose Resend Invitation. Confirm the email first. If the person already knows the login email, Forgot password gives the same password-setting outcome.' },
      { heading: 'How to assign a volunteer', text: 'Open Tasks, find and expand the correct dated occurrence, then select an eligible person under Assign volunteer. Wait for the success message and confirm the name appears. The selector disables when the task is full.' },
      { heading: 'How to edit a task manually', text: 'Open Tasks, expand the correct occurrence, and choose Edit Task. Change the title, description, start or end time, location, capacity, reminder hours, or self-signup setting. Choose whether the edit applies only to this date or to this and all future dates, then save.' },
      { heading: 'How to change capacity', text: 'Choose Edit Task and change Volunteers needed. The number cannot be lower than the volunteers already assigned. Saving a larger number reopens assignment capacity.' },
      { heading: 'How to cancel and reopen', text: 'Find the dated task and choose Cancel task. For a recurring series, choose whether it applies once or to future dates. Choose Reopen on a cancelled task to reverse the action.' },
      { heading: 'How to delete safely', text: 'Choose Move to Trash, select one or future dates for a recurring task, and confirm. Regular Admins then ask the Owner if restoration is needed. Do not use cancellation merely to hide incorrect test data.' },
      { heading: 'How to send an announcement', text: 'Open Announcements, choose the intended audience and channels, write a clear message, verify recipients, and submit. Check delivery history afterward; external provider acceptance is separate from saving the announcement.' },
    ], keywords: ['how to admin', 'add volunteer', 'resend', 'assign', 'capacity', 'cancel', 'delete', 'announcement'],
  },
  {
    id: 'effective-workflow', title: 'Recommended workflow for every event', category: 'How To', roles: ['admin', 'owner'],
    summary: 'A repeatable before, during, and after-event process that keeps planning and records consistent.',
    sections: [
      { heading: 'Before planning', text: 'Search for an existing event or template. Create one event record, confirm its date, and avoid making duplicate events for the same program.' },
      { heading: 'During planning', text: 'Record meeting notes, decisions, action owners, and due dates. Create tasks under the event with realistic capacity, locations, and reminder timing.' },
      { heading: 'One week before', text: 'Filter for the event and review Need people. Assign volunteers or communicate open opportunities. Confirm phone details and provider readiness rather than assuming reminders will deliver.' },
      { heading: 'One day before', text: 'Review last-minute gaps, cancelled tasks, times, and locations. Avoid changing dates after reminders have already been sent unless volunteers are contacted directly.' },
      { heading: 'During the event', text: 'Keep assignments current, record check-in and checkout where used, and cancel only work that will not occur.' },
      { heading: 'After the event', text: 'Allow completion to derive from time, review service hours and delivery records, request feedback, summarize lessons, and update the reusable template.' },
    ], keywords: ['event workflow', 'before event', 'during event', 'after event', 'planning checklist', 'best practice'],
  },
  {
    id: 'troubleshooting', title: 'How to troubleshoot common problems', category: 'How To', roles: ['everyone'],
    summary: 'Fast checks for missing tasks, assignments, messages, verification codes, and access.',
    sections: [
      { heading: 'A task is missing', text: 'Clear search and filters, verify the date range and event, and check whether the task is completed, cancelled, or in Trash. Volunteers only see eligible open tasks and their own assignments.' },
      { heading: 'An assignment did not save', text: 'Confirm the task still has an open place, the volunteer is active with WhatsApp and a phone, and the person is not already assigned. Retry once and copy any error message for the Owner.' },
      { heading: 'A reminder did not arrive', text: 'Confirm assignment, task time, reminder schedule, channel preference, and valid contact details. Admins should check message history and the email or WhatsApp provider status. Never assume a saved reminder means the provider delivered it.' },
      { heading: 'An SMS code did not arrive', text: 'Check country code and phone digits, wait before retrying, and confirm Firebase Phone Authentication, authorized domain, quota, and billing configuration. Do not repeatedly request codes because Firebase limits verification traffic.' },
      { heading: 'The wrong dashboard appears', text: 'Confirm the email is verified, refresh or sign out and back in, and ask the Owner to check Admin Management. Removing Admin access returns the account to its Volunteer permissions.' },
      { heading: 'An email says the user exists', text: 'The Firebase Authentication login may remain even if a volunteer profile was deleted. Use Forgot password for that email or have an authorized system administrator remove the authentication account.' },
    ], keywords: ['troubleshoot', 'problem', 'missing task', 'assignment not saved', 'reminder not received', 'sms code', 'wrong dashboard', 'user exists'],
  },
  {
    id: 'start', title: 'Getting started and signing in', category: 'Getting Started', roles: ['everyone'],
    summary: 'Create an account, verify your email, sign in, and recover a forgotten password.',
    sections: [
      { heading: 'Volunteer signup', text: 'Enter your first and last name, email, phone number, and a password made specifically for this app. Confirm the verification email before signing in. The phone must use a valid international format and is verified separately by SMS from My Profile.' },
      { heading: 'Invitation from an admin', text: 'An admin can create a volunteer account and send an invitation. Open the email and use its password-setting link. If it expires, use Forgot password or ask an admin to resend the invitation; both lead to setting a new password.' },
      { heading: 'Sign-in problems', text: 'Use Forgot password if the account exists but the password is unknown. If an administrator deleted only the volunteer profile, the Firebase login may still exist and the same email cannot register again until the authentication account is also removed.' },
    ], keywords: ['signup', 'register', 'login', 'password', 'invitation', 'email verification', 'forgot password'],
  },
  {
    id: 'roles', title: 'Roles: Volunteer, Admin, and Owner', category: 'Getting Started', roles: ['everyone'],
    summary: 'Understand what each access level can see and change.',
    sections: [
      { heading: 'Volunteer', text: 'Volunteers manage their profile, browse open tasks, sign themselves up where allowed, withdraw where allowed, see their assignments, submit event feedback, and record their service hours.' },
      { heading: 'Admin', text: 'Admins handle normal operations: volunteers, tasks, assignments, events, meeting notes, announcements, reports, and reminders. Admins may move tasks to Trash but cannot restore them, permanently delete them, or manage administrator access.' },
      { heading: 'Owner', text: 'The Owner has all Admin capabilities plus Admin Management, Trash restoration, and permanent task deletion. The Owner account is protected from removal in the app.' },
    ], keywords: ['role', 'permission', 'owner', 'admin', 'volunteer', 'security', 'access'],
  },
  {
    id: 'profile', title: 'Profile, availability, and reminder preferences', category: 'Volunteers', roles: ['volunteer', 'admin', 'owner'],
    summary: 'Keep contact details current and explain how availability and notification settings are used.',
    sections: [
      { heading: 'Profile information', text: 'My Profile stores name, email, phone, typical available days, and reminder channels. Save changes after editing. Email is tied to the login account and is displayed as read-only to volunteers.' },
      { heading: 'Available days', text: 'Available days help coordinators understand when a volunteer usually prefers to serve. They do not automatically assign or block tasks. No selection means no usual-day preference was provided; the volunteer can still sign up or be assigned.' },
      { heading: 'WhatsApp requirement', text: 'WhatsApp reminders are enabled by default for active volunteers. Turning WhatsApp off displays a warning and makes the profile inactive, preventing new assignments and service notifications while preserving history.' },
      { heading: 'Browser push', text: 'Browser push is optional and must be enabled separately on each device. Email and WhatsApp do not depend on browser push.' },
    ], keywords: ['profile', 'availability', 'available days', 'whatsapp', 'email', 'browser push', 'inactive'],
  },
  {
    id: 'phone', title: 'Phone numbers and SMS verification', category: 'Volunteers', roles: ['volunteer', 'admin', 'owner'],
    summary: 'Why phone validation is required and how verification works.',
    sections: [
      { heading: 'Format', text: 'Phone numbers are normalized to international E.164 format, beginning with + and country code. A valid-looking number is not proof that the person owns it.' },
      { heading: 'Verify ownership', text: 'After email verification, open My Profile and request an SMS code. Enter the received code to verify the number. Firebase phone authentication must be enabled and the deployed domain authorized; Blaze billing may be required beyond Firebase test limits.' },
      { heading: 'SMS versus WhatsApp', text: 'SMS verification proves control of the phone. Task reminders sent by SMS would require a separate SMS provider or Firebase-related implementation; WhatsApp reminders use the configured WhatsApp Business provider and approved templates.' },
    ], keywords: ['phone', 'sms', 'verification', 'code', 'e164', 'blaze', 'whatsapp'],
  },
  {
    id: 'tasks-volunteer', title: 'Finding, joining, and leaving tasks', category: 'Tasks', roles: ['volunteer'],
    summary: 'Use Open Tasks and My Tasks to manage service commitments.',
    sections: [
      { heading: 'Open Tasks', text: 'Open Tasks shows future tasks that permit volunteer self-signup and still have space. Search and filters help narrow the list. Select Sign Up to take an available place.' },
      { heading: 'My Tasks', text: 'My Tasks shows current assignments. A volunteer can withdraw when self-withdrawal is allowed. Contact an admin if the task is locked, cancelled, or requires coordinator assistance.' },
      { heading: 'Capacity', text: 'A task cannot accept more assigned volunteers than Volunteers needed. Assignment controls close once all places are filled.' },
    ], keywords: ['open tasks', 'my tasks', 'sign up', 'withdraw', 'capacity', 'filled'],
  },
  {
    id: 'task-status', title: 'Task status and lifecycle', category: 'Tasks', roles: ['everyone'],
    summary: 'What Open, Filled, Completed, and Cancelled mean.',
    sections: [
      { heading: 'Open', text: 'The task is active and has at least one unfilled volunteer place.' },
      { heading: 'Filled', text: 'The required volunteer count has been reached. Assignment controls are disabled until someone is removed or the required count is increased.' },
      { heading: 'Completed', text: 'Completion is determined automatically from the task end time, or start time when no end time is supplied. Admins do not need to manually mark it complete.' },
      { heading: 'Cancelled', text: 'The task was explicitly cancelled and reminders stop. Admins can use Reopen to reverse a mistaken cancellation.' },
    ], keywords: ['status', 'open', 'filled', 'completed', 'cancelled', 'reopen', 'lifecycle'],
  },
  {
    id: 'admin-volunteers', title: 'Managing volunteers', category: 'Administration', roles: ['admin', 'owner'],
    summary: 'Add, import, edit, invite, assign, and deactivate volunteer records.',
    sections: [
      { heading: 'Add one volunteer', text: 'Open Volunteers, enter all required details including phone, confirm WhatsApp consent, and send the invitation. The volunteer receives a password-setting workflow and has the same Firebase login capability as a self-registered user.' },
      { heading: 'Bulk CSV import', text: 'Use the CSV import control and its expected columns. Imported records follow the same active-profile, phone, WhatsApp, and invitation rules as individually added records. Review validation errors before retrying rejected rows.' },
      { heading: 'Edit and assign', text: 'Admins can update volunteer details and assign active volunteers with a WhatsApp phone to tasks. Reaching the required count disables further assignment.' },
      { heading: 'Login email', text: 'A volunteer login email is read-only in the Admin editor so the profile cannot disagree with Firebase Authentication. Use the existing email for login and password reset.' },
      { heading: 'Delete an account', text: 'When secure account deletion is enabled, choose Delete account only after confirming the correct person. It deletes the Firebase login and profile, removes future assignments, and preserves completed service and feedback only in anonymized form. This control requires the Firebase Blaze plan; an Admin account must first have its Admin access removed by the Owner.' },
      { heading: 'Invitations', text: 'Use Resend Invitation when a volunteer did not act on the original email. The volunteer may alternatively use Forgot password. An unaccepted invitation does not prevent an admin from assigning the volunteer; reminder delivery still depends on valid configured contact channels.' },
    ], keywords: ['add volunteer', 'csv', 'bulk import', 'edit volunteer', 'resend invitation', 'assign'],
  },
  {
    id: 'admin-tasks', title: 'Creating tasks and recurring schedules', category: 'Administration', roles: ['admin', 'owner'],
    summary: 'Create standalone or event tasks, set capacity, recurrence, signup, and reminder timing.',
    sections: [
      { heading: 'Create a task', text: 'Provide a title and start date/time. Optionally add an event, description, end time, location, volunteer count, recurrence, signup permission, and comma-separated reminder hours such as 48, 24, 2.' },
      { heading: 'Recurring tasks', text: 'Daily, weekly, and monthly schedules generate dated occurrences ahead of time. Each occurrence can have different assigned volunteers. Choose whether an edit, cancellation, or Trash action affects one date or that date and future occurrences.' },
      { heading: 'Assignments', text: 'Select an eligible volunteer from the occurrence dropdown. Names appear immediately after a successful save. Remove someone to reopen capacity.' },
      { heading: 'Manual editing', text: 'Choose Edit Task on a dated occurrence to update its details without AI. For a recurring series, apply the changes only to that occurrence or to that date and all future occurrences.' },
    ], keywords: ['create task', 'recurring', 'weekly', 'monthly', 'daily', 'reminder hours', 'assignment'],
  },
  {
    id: 'reminders', title: 'Automatic reminders and delivery channels', category: 'Notifications', roles: ['everyone'],
    summary: 'When reminders run and what is required for email, WhatsApp, and browser push.',
    sections: [
      { heading: 'Timing', text: 'Each task stores reminder hours before its start. The scheduled reminder service checks upcoming assigned tasks, sends each configured reminder once, and records delivery results for administrators.' },
      { heading: 'Eligibility', text: 'Cancelled, completed, and trashed tasks do not generate reminders. A volunteer must be assigned and have the relevant channel enabled with valid contact information.' },
      { heading: 'Channels', text: 'Email requires the configured email provider. WhatsApp requires a working WhatsApp Business account, sender number, access token, and approved message template. Browser push requires permission and registration on that device.' },
      { heading: 'Troubleshooting', text: 'Admins can inspect reminder and message history. A saved assignment does not guarantee delivery if the external provider is restricted, credentials are missing, a template is rejected, or the address or phone is invalid.' },
    ], keywords: ['automatic reminder', 'email', 'whatsapp', 'push', 'delivery', 'template', 'provider'],
  },
  {
    id: 'events', title: 'Events, planning meetings, and templates', category: 'Events', roles: ['admin', 'owner'],
    summary: 'Organize tasks around events and preserve planning knowledge.',
    sections: [
      { heading: 'Event workspace', text: 'Create an event to group its tasks, planning notes, action items, and feedback. The event date is the scheduled date used for organization and template-based planning.' },
      { heading: 'Meeting notes', text: 'Capture the meeting date, attendees, discussion, decisions, and action items. Include an owner and due date in action items so follow-up is clear.' },
      { heading: 'Event templates', text: 'A template is a reusable event plan. It saves a common event structure and task list so a similar future event can be created for a new date without starting over.' },
    ], keywords: ['event', 'workspace', 'meeting notes', 'action items', 'template', 'date', 'planning'],
  },
  {
    id: 'feedback', title: 'Event feedback and lessons learned', category: 'Events', roles: ['everyone'],
    summary: 'Collect free-flowing feedback and turn it into improvements.',
    sections: [
      { heading: 'Volunteer feedback', text: 'Open Event Feedback, choose the relevant event, and enter free-flowing comments about what worked, what did not, and ideas for next time. Feedback can be submitted once per volunteer per event and updated.' },
      { heading: 'Admin review', text: 'Admins review responses in the event workspace, summarize lessons, and save improvements to carry into the next event or template.' },
    ], keywords: ['feedback', 'comments', 'lessons', 'improvements', 'event'],
  },
  {
    id: 'ai-create', title: 'Using the AI Task Assistant', category: 'Administration', roles: ['admin', 'owner'],
    summary: 'Create plans or safely update task details and assignments using plain language.',
    sections: [
      { heading: 'Create', text: 'Describe an event and tasks in ordinary language. The assistant produces an editable preview; verify dates, times, capacity, and task names before applying it.' },
      { heading: 'Manage tasks', text: 'Ask to update a task, change a date or location, assign or remove a volunteer, or cancel and reopen a task. Include the exact task, date, and volunteer name or email. Relative dates are resolved using the current date and time zone.' },
      { heading: 'Safety', text: 'The assistant only proposes supported changes against known IDs. Nothing is saved until an admin reviews and applies the preview. It does not permanently delete records.' },
    ], keywords: ['ai create', 'assistant', 'update task', 'assign volunteer', 'preview', 'natural language'],
  },
  {
    id: 'trash', title: 'Cancel, Trash, Undo, and recovery', category: 'Safety & Recovery', roles: ['admin', 'owner'],
    summary: 'Choose the reversible action and recover mistakes.',
    sections: [
      { heading: 'Cancel versus Trash', text: 'Cancel when a task will not happen but its record should remain visible in history; use Reopen to reverse it. Move to Trash when the task record should be removed from active views.' },
      { heading: 'Admin boundary', text: 'Admins can cancel, reopen, and move tasks to Trash. They cannot restore or permanently delete trashed tasks.' },
      { heading: 'Owner recovery', text: 'The Owner can restore a task or a deleted group of recurring occurrences from Task Trash. Permanent deletion requires confirmation and cannot be undone. Trash is automatically purged after 30 days.' },
    ], keywords: ['delete', 'deleted', 'trash', 'task recovery', 'undo', 'restore', 'permanent', 'cancel', 'reopen', '30 days'],
  },
  {
    id: 'analytics', title: 'Analytics, filters, and planning decisions', category: 'Reports', roles: ['admin', 'owner'],
    summary: 'Use dashboard metrics and filters to identify coverage, participation, and planning needs.',
    sections: [
      { heading: 'Filters', text: 'Filter by task or event text, status, event, date range, and sort order to focus the dashboard. Clear filters to return to the full view.' },
      { heading: 'Planning', text: 'Use open places and fill rates to identify staffing gaps, participation and hours to understand engagement, and event feedback to improve repeat events. Treat low activity as a prompt for outreach, not a judgment about a volunteer.' },
    ], keywords: ['analytics', 'dashboard', 'filter', 'search', 'coverage', 'hours', 'planning'],
  },
  {
    id: 'owner-admins', title: 'Owner: managing Admin access', category: 'Owner', roles: ['owner'],
    summary: 'Grant and revoke regular Admin access safely.',
    sections: [
      { heading: 'Add an Admin', text: 'Open Admin Management, select an existing registered volunteer, and choose Give Admin Access. The person keeps their volunteer profile and assignments while gaining the Admin dashboard after their next authorization refresh.' },
      { heading: 'Remove access', text: 'Choose Remove Admin Access beside a regular Admin and confirm. Revocation takes effect live; their volunteer profile, assignments, and service history remain.' },
      { heading: 'Protected Owner', text: 'The Owner record cannot be removed or changed through the application. Regular Admins cannot see Admin Management or grant access to anyone.' },
    ], keywords: ['owner', 'admin management', 'promote', 'revoke', 'remove admin', 'security'],
  },
  {
    id: 'privacy-security', title: 'Security, privacy, and responsible administration', category: 'Safety & Recovery', roles: ['everyone'],
    summary: 'Understand shared data, access boundaries, and safe handling of volunteer information.',
    sections: [
      { heading: 'Shared operational data', text: 'Admins collaborate on the same volunteers, tasks, events, notes, and reports. Records are not privately owned by the admin who created them.' },
      { heading: 'Boundaries', text: 'Firestore rules—not only screen visibility—separate volunteers from administrators and reserve administrator management and permanent task deletion for the Owner. Reminder queue records cannot be changed from the browser.' },
      { heading: 'Good practice', text: 'Grant Admin access only to trusted coordinators. Use Trash instead of permanent deletion, verify recipients before announcements, avoid sensitive personal details in meeting notes, and remove access promptly when responsibilities change.' },
    ], keywords: ['privacy', 'security', 'shared', 'firestore', 'access', 'personal information'],
  },
];

export function helpArticleText(article: HelpArticle): string {
  return [article.title, article.summary, article.keywords.join(' '), ...article.sections.flatMap((section) => [section.heading, section.text])].join(' ');
}

export function findHelpArticles(query: string, articles = HELP_ARTICLES): HelpArticle[] {
  const stopWords = new Set(['a', 'an', 'and', 'are', 'can', 'do', 'for', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'the', 'to', 'what', 'when', 'where', 'why']);
  const words: string[] = Array.from(query.toLowerCase().match(/[a-z0-9]+/g) || []).filter((word) => !stopWords.has(word));
  if (!words.length) return articles;
  return articles
    .map((article) => {
      const haystack = helpArticleText(article).toLowerCase();
      const title = article.title.toLowerCase();
      const keywords = article.keywords.join(' ').toLowerCase();
      const score = words.reduce((sum, word) => sum
        + (title.includes(word) ? 6 : 0)
        + (keywords.includes(word) ? 4 : 0)
        + (haystack.includes(word) ? 1 : 0), 0);
      return { article, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ article }) => article);
}
