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
      { heading: '1. Activate your account', text: 'Self-register with your name, email, phone, and a password, or open the secure WhatsApp portal invitation sent after an admin creates your phone-only profile. A portal link expires after 7 days; ask the Owner to resend it if needed. Confirm your email before signing in.' },
      { heading: '2. Complete My Profile', text: 'Open My Profile, check your name and phone, select the days you are usually available, and save. Availability is guidance for coordinators; it does not block you from other days.' },
      { heading: '3. Keep your phone current', text: 'Phone number is the primary volunteer identity and is stored in international format. A phone already used by another active profile cannot be saved. Keep WhatsApp enabled so your profile remains active and task reminders can reach you.' },
      { heading: '4. Join a task', text: 'Open Open Tasks, search by event, task, or location, then use Availability to show tasks available for signup, full tasks, or all upcoming tasks. Choose Sign Up when a place is open.' },
      { heading: '5. Confirm your commitment', text: 'Open My Upcoming Tasks and verify that the assignment appears. Review the location and time. If plans change, withdraw early where the button is available or contact an admin. Previous assignments are kept separately under Past Tasks.' },
      { heading: '6. Serve and record time', text: 'For tasks using hour tracking, check in when service begins and check out when it ends. Confirm that the recorded hours appear correctly.' },
      { heading: '7. Create or review service work', text: 'Use Create & Manage Tasks to create a standalone, non-repeating task with one reminder, assign volunteers, edit it, or delete your own task. Other volunteers, Admins, and Owners can sign up. Event Calendar is available read-only. After an event, use Event Feedback to share lessons.' },
    ], keywords: ['new volunteer', 'quick start', 'first day', 'onboarding', 'how to begin', 'checklist'],
  },
  {
    id: 'admin-quick-start', title: 'How to get started as a new Admin', category: 'Quick Start', roles: ['admin', 'owner'],
    summary: 'The recommended sequence for setting up people, events, tasks, assignments, and reminders.',
    sections: [
      { heading: '1. Confirm access', text: 'Sign in with a verified email. The header should say Admin or Owner. If you still see the Volunteer dashboard, ask the Owner to verify your Admin access.' },
      { heading: '2. Review volunteers', text: 'Open People > Volunteers. Phone number is the duplicate identity key and is normalized before saving. Confirm name, optional email, international phone number, active status, and WhatsApp consent. The Owner sees a warning when existing records share a phone.' },
      { heading: '3. Create the event first', text: 'For an organized program, open Events > Event Calendar or Event Workspace and create the event with its correct name, date, owner, and description. Event owners are selected from the volunteer list. Standalone operational tasks do not require an event.' },
      { heading: '4. Create tasks', text: 'Open Tasks > Create & Manage, enter the title and Eastern Time (ET) start time, then add end time, location, volunteers needed, recurrence, and reminder hours. Use Browse & Sign Up for self-service and My Assignments for your commitments. Link the task to an event when applicable.' },
      { heading: '5. Check every occurrence', text: 'For recurring work, expand the series and verify the generated dates. Each occurrence has its own assignments and capacity.' },
      { heading: '6. Fill coverage gaps', text: 'Assign eligible volunteers from the dropdown or allow self-signup. Watch Open and Need people counts. The assignment control closes automatically when capacity is reached.' },
      { heading: '7. Verify communications', text: 'Open Communication for Announcements and the Invitation Queue when your role permits it. Before relying on task reminders, confirm the assigned volunteer has a valid WhatsApp phone. Review message history for provider or delivery failures.' },
      { heading: '8. Close the learning loop', text: 'Capture meeting decisions before the event, review feedback afterward, save lessons learned, and update an event template if the event will repeat.' },
    ], keywords: ['new admin', 'quick start', 'first day', 'onboarding', 'admin checklist', 'setup workflow'],
  },
  {
    id: 'admin-navigation', title: 'Admin and Owner dashboard navigation', category: 'Quick Start', roles: ['admin', 'owner'],
    summary: 'Find each workflow in the simplified grouped navigation.',
    sections: [
      { heading: 'Tasks', text: 'Browse & Sign Up is the shared opportunity list, My Assignments is your personal schedule, Create & Manage combines task creation with all management controls, and Create with AI opens the reviewed AI workflow.' },
      { heading: 'Events', text: 'Event Calendar provides year, month, week, and day views. Event Workspace holds planning details, meetings, action items, feedback, and templates.' },
      { heading: 'People', text: 'Volunteers contains add, CSV import, editing, search, and duplicate-phone information. Admin Management is Owner-only.' },
      { heading: 'Communication', text: 'For the Owner, Announcements and Invitation Queue are grouped under Communication. The queue is for phone-only volunteers who still need to add an email.' },
      { heading: 'Reports and More', text: 'Reports contains Analytics, Costs, and App Value according to role. More contains History, Trash, Audit, and Help according to role.' },
    ], keywords: ['navigation', 'menu', 'tasks menu', 'events menu', 'people', 'communication', 'reports', 'more'],
  },
  {
    id: 'owner-quick-start', title: 'How to get started as the Owner', category: 'Quick Start', roles: ['owner'],
    summary: 'Secure the application, delegate normal operations, and retain recovery controls.',
    sections: [
      { heading: '1. Confirm Owner access', text: 'Sign in and confirm that the header says Owner and Admin Management is visible. The original bootstrap administrator is treated as the protected Owner.' },
      { heading: '2. Choose trusted Admins', text: 'Ask each coordinator to register first. Open Admin Management, select the correct existing volunteer, verify the displayed email, and choose Give Admin Access.' },
      { heading: '3. Explain the boundary', text: 'Admins perform daily operations and can move tasks to Trash. Only the Owner manages Admin access, restores trashed tasks, and permanently deletes tasks.' },
      { heading: '4. Review access regularly', text: 'Periodically open Admin Management and remove Admin access when a coordinator no longer needs it. Their volunteer profile, assignments, and service history remain.' },
      { heading: '5. Protect recovery and identity', text: 'Review Trash before its 30-day cleanup. Restore mistakes and permanently delete only when certain. In People > Volunteers, resolve the orange duplicate-phone warning by keeping the correct profile; phone number is the volunteer identity key.' },
      { heading: '6. Manage portal invitations', text: 'Open Communication > Invitation Queue after the Meta template volunteer_portal_invite_v1 is approved. Enable sending, send pending links, and resend only for volunteers who still have no email. Each secure link expires after 7 days.' },
      { heading: '7. Control WhatsApp safely', text: 'Use the Owner WhatsApp emergency stop if messages must stop immediately. The app also limits WhatsApp to 100 messages per Eastern Time day and sends a warning at 50. Resume only after the issue is understood.' },
    ], keywords: ['new owner', 'owner setup', 'quick start', 'admin access', 'security checklist'],
  },
  {
    id: 'how-to-common', title: 'How to perform common actions', category: 'How To', roles: ['everyone'],
    summary: 'Short directions for the actions people use most often.',
    sections: [
      { heading: 'How to change your password', text: 'Sign out, open Log in, choose Forgot password, enter the account email, and follow the emailed link. An admin-created volunteer can use this same process.' },
      { heading: 'How to update your phone', text: 'Open My Profile, replace the phone with its country code, and save. The app normalizes the number and blocks it if another active volunteer profile already uses it.' },
      { heading: 'How to find a task', text: 'Open Open Tasks and type part of the task, event, or location into Search. Adjust filters or sorting if available. Clear filters if an expected task is missing.' },
      { heading: 'How to know you are assigned', text: 'After signup or admin assignment, the task appears under My Upcoming Tasks and its assigned count increases. After the task date it moves to Past Tasks. If it does not appear, refresh and ask an admin to confirm the saved assignment.' },
      { heading: 'How to stop participating', text: 'Withdraw from a future task or contact an admin about the assignment. Turning off required WhatsApp makes the profile inactive; it is not a substitute for cancelling one task.' },
      { heading: 'How to get help', text: 'Search this manual or ask the Help Assistant using a specific question. Include the screen name, action attempted, and exact error message. Do not include passwords, SMS codes, or access tokens.' },
    ], keywords: ['how to', 'common actions', 'password', 'update phone', 'find task', 'assigned', 'get help'],
  },
  {
    id: 'how-to-admin-actions', title: 'How to perform common Admin actions', category: 'How To', roles: ['admin', 'owner'],
    summary: 'Step-by-step directions for routine volunteer and task administration.',
    sections: [
      { heading: 'How to add one volunteer', text: 'Open People > Volunteers. Enter first name, last name, international phone, and an optional email. Without email, the profile can be assigned immediately and enters the WhatsApp Invitation Queue. With email, an email login invitation is sent. A phone already used by another profile is rejected.' },
      { heading: 'How to resend an invitation', text: 'For a phone-only volunteer, open Communication > Invitation Queue and resend a fresh 7-day WhatsApp link. For a volunteer already created with email, use Resend invitation in Volunteers or have them use Forgot password.' },
      { heading: 'How to assign a volunteer', text: 'Open Tasks > Create & Manage, find and expand the correct dated occurrence, then select an eligible person under Assign volunteer. Wait for the success message and confirm the name appears. The selector disables when the task is full.' },
      { heading: 'How to edit a task manually', text: 'Open Tasks > Create & Manage, expand the correct occurrence, and choose Edit Task. Change the title, description, start or end time, location, capacity, or reminder hours. Choose whether the edit applies only to this date or to this and all future dates, then save.' },
      { heading: 'How to change capacity', text: 'Choose Edit Task and change Volunteers needed. The number cannot be lower than the volunteers already assigned. Saving a larger number reopens assignment capacity.' },
      { heading: 'How to cancel and reopen', text: 'Find the dated task and choose Cancel task. For a recurring series, choose whether it applies once or to future dates. Choose Reopen on a cancelled task to reverse the action.' },
      { heading: 'How to delete safely', text: 'Choose Move to Trash, select one or future dates for a recurring task, and confirm. Regular Admins then ask the Owner if restoration is needed. Do not use cancellation merely to hide incorrect test data.' },
      { heading: 'How to send an announcement', text: 'Open Announcements, choose the intended audience and channels, write a clear message, verify recipients, and submit. Check delivery history afterward; external provider acceptance is separate from saving the announcement.' },
      { heading: 'How to focus on your work', text: 'Use Tasks > My Assignments for your commitments, Browse & Sign Up for available work, and Create & Manage for creation, assignment, editing, cancellation, and Trash. In the management view, filter between all tasks, tasks created by you, and tasks assigned to you.' },
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
      { heading: 'A task is missing', text: 'Admins should open Tasks > Create & Manage, choose All tasks, clear other filters, and check whether the task is completed, cancelled, or in Trash. Volunteers see eligible future tasks, their assignments, and tasks they created.' },
      { heading: 'An assignment did not save', text: 'Confirm the task still has an open place, the volunteer is active with WhatsApp and a phone, and the person is not already assigned. Retry once and copy any error message for the Owner.' },
      { heading: 'A reminder did not arrive', text: 'Confirm assignment, task time, reminder schedule, channel preference, and valid contact details. Admins should check message history and the email or WhatsApp provider status. Never assume a saved reminder means the provider delivered it.' },
      { heading: 'A phone number is rejected', text: 'Check the country code and digits. If the message says the phone already exists, do not create another profile. Ask the Owner to review People > Volunteers for a duplicate warning or resend the existing profile invitation.' },
      { heading: 'The wrong dashboard appears', text: 'Confirm the email is verified, refresh or sign out and back in, and ask the Owner to check Admin Management. Removing Admin access returns the account to its Volunteer permissions.' },
      { heading: 'An email says the user exists', text: 'The Firebase Authentication login may remain even if a volunteer profile was deleted. Use Forgot password for that email or have an authorized system administrator remove the authentication account.' },
    ], keywords: ['troubleshoot', 'problem', 'missing task', 'assignment not saved', 'reminder not received', 'sms code', 'wrong dashboard', 'user exists'],
  },
  {
    id: 'start', title: 'Getting started and signing in', category: 'Getting Started', roles: ['everyone'],
    summary: 'Create an account, verify your email, sign in, and recover a forgotten password.',
    sections: [
      { heading: 'Volunteer signup', text: 'Enter first and last name, email, phone number, and a password. Confirm the verification email before signing in. The phone must use international format and cannot already belong to another active volunteer profile.' },
      { heading: 'Invitation from an admin', text: 'An admin can add you with phone only and assign you immediately. When the approved WhatsApp portal invitation arrives, open its secure link, add your email, and choose a password; your existing assignments remain attached. The link expires after 7 days and the Owner can resend it. If an admin originally supplied your email, use the email invitation or Forgot password.' },
      { heading: 'Sign-in problems', text: 'Use Forgot password if the account exists but the password is unknown. If an administrator deleted only the volunteer profile, the Firebase login may still exist and the same email cannot register again until the authentication account is also removed.' },
    ], keywords: ['signup', 'register', 'login', 'password', 'invitation', 'email verification', 'forgot password'],
  },
  {
    id: 'roles', title: 'Roles: Volunteer, Admin, and Owner', category: 'Getting Started', roles: ['everyone'],
    summary: 'Understand what each access level can see and change.',
    sections: [
      { heading: 'Volunteer', text: 'Volunteers manage their profile, browse open tasks, sign up or withdraw, see assignments, create and manage their own standalone non-repeating tasks, view the Event Calendar read-only, submit feedback, and record service hours.' },
      { heading: 'Admin', text: 'Admins handle normal operations: volunteers, tasks, assignments, events, meeting notes, reports, and reminders. They can browse and join tasks like volunteers. Admins may move tasks to Trash but cannot restore them, permanently delete them, manage administrator access, or use Owner-only communication controls.' },
      { heading: 'Owner', text: 'The Owner has all Admin capabilities plus Admin Management, Trash restoration, and permanent task deletion. The Owner account is protected from removal in the app.' },
    ], keywords: ['role', 'permission', 'owner', 'admin', 'volunteer', 'security', 'access'],
  },
  {
    id: 'profile', title: 'Profile, availability, and reminder preferences', category: 'Volunteers', roles: ['volunteer', 'admin', 'owner'],
    summary: 'Keep contact details current and explain how availability and notification settings are used.',
    sections: [
      { heading: 'Profile information', text: 'My Profile stores name, email, phone, typical available days, and the WhatsApp reminder preference. Save changes after editing. Email is tied to the login account, displayed as read-only to volunteers, and does not have a reminder preference checkbox.' },
      { heading: 'Available days', text: 'Available days help coordinators understand when a volunteer usually prefers to serve. They do not automatically assign or block tasks. No selection means no usual-day preference was provided; the volunteer can still sign up or be assigned.' },
      { heading: 'WhatsApp requirement', text: 'WhatsApp reminders are enabled by default for active volunteers. Turning WhatsApp off displays a warning and makes the profile inactive, preventing new assignments and service notifications while preserving history.' },
      { heading: 'Temple reminder number', text: 'Automatic reminders come from the temple WhatsApp number +1 (973) 299-0970. Add it to your contacts. It is an automated sender and replies are not monitored.' },
    ], keywords: ['profile', 'availability', 'available days', 'whatsapp', 'email', 'inactive'],
  },
  {
    id: 'phone', title: 'Phone numbers and duplicate identity', category: 'Volunteers', roles: ['volunteer', 'admin', 'owner'],
    summary: 'How normalized phone numbers identify volunteer profiles and prevent duplicates.',
    sections: [
      { heading: 'Format', text: 'Phone numbers are normalized to international E.164 format, beginning with + and country code. A valid-looking number is not proof that the person owns it.' },
      { heading: 'Duplicate prevention', text: 'The normalized phone is the primary volunteer identity key. Admin add, CSV import, self-registration, and profile edits reject a phone already used by another active profile. Use the existing profile instead of changing formatting or creating another login.' },
      { heading: 'Owner duplicate view', text: 'Existing historical duplicates appear in an orange panel at the top of People > Volunteers for the Owner. Records are grouped by normalized phone and affected volunteer cards show a duplicate phone label.' },
      { heading: 'Phone versus WhatsApp', text: 'The stored phone identifies the volunteer and receives WhatsApp reminders when enabled. Automatic task reminders use the configured WhatsApp Business provider and approved task_reminder_hk_v4 template; a phone format check alone does not prove delivery.' },
    ], keywords: ['phone', 'sms', 'verification', 'code', 'e164', 'blaze', 'whatsapp'],
  },
  {
    id: 'tasks-volunteer', title: 'Finding, joining, and leaving tasks', category: 'Tasks', roles: ['volunteer'],
    summary: 'Join service commitments and create manageable standalone tasks.',
    sections: [
      { heading: 'Open Tasks', text: 'Open Tasks shows future tasks. Use Availability to switch between tasks available for signup, full tasks, and all upcoming tasks. Search and sorting further narrow the list.' },
      { heading: 'My Upcoming Tasks', text: 'My Upcoming Tasks shows current future assignments. A volunteer can withdraw when self-withdrawal is allowed. Contact an admin if the task is locked, cancelled, or requires coordinator assistance.' },
      { heading: 'Past Tasks', text: 'Past Tasks keeps previous assignments separate from upcoming commitments and supports the same search and sorting controls.' },
      { heading: 'Capacity', text: 'A task cannot accept more assigned volunteers than Volunteers needed. Assignment controls close once all places are filled.' },
      { heading: 'Overlapping assignments', text: 'If two upcoming assignments have the same time or overlap, the dashboard displays a warning and identifies the conflicting tasks. The warning does not block signup or remove either assignment; review the times, withdraw if appropriate, or contact an Admin.' },
      { heading: 'Create & Manage Tasks', text: 'Create a standalone task with a future Eastern Time start, capacity, location, eligible assignees, and one reminder. Volunteer tasks cannot link to events or repeat. You can edit and delete only tasks you created; other people can sign up, including Admins and Owners.' },
    ], keywords: ['open tasks', 'my upcoming tasks', 'past tasks', 'sign up', 'withdraw', 'capacity', 'filled'],
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
      { heading: 'Add one volunteer', text: 'Open People > Volunteers and enter first name, last name, international phone, and optional email. Phone-only volunteers are active for assignments immediately and wait in Communication > Invitation Queue. Email volunteers receive the existing email login workflow.' },
      { heading: 'Bulk CSV import', text: 'CSV columns are first name, last name, optional email, phone, and WhatsApp consent. Phone-only and email rows follow the same duplicate-phone rule as individual additions. Invalid or duplicate rows are skipped and counted.' },
      { heading: 'Edit and assign', text: 'Admins can update volunteer details and assign active volunteers with a WhatsApp phone to tasks. Reaching the required count disables further assignment.' },
      { heading: 'Login email', text: 'A volunteer login email is read-only in the Admin editor so the profile cannot disagree with Firebase Authentication. Use the existing email for login and password reset.' },
      { heading: 'Delete an account', text: 'When secure account deletion is enabled, choose Delete account only after confirming the correct person. It deletes the Firebase login and profile, removes future assignments, and preserves completed service and feedback only in anonymized form. This control requires the Firebase Blaze plan; an Admin account must first have its Admin access removed by the Owner.' },
      { heading: 'Invitations', text: 'The Owner opens Communication > Invitation Queue after Meta approves volunteer_portal_invite_v1. Pending phone-only volunteers can receive or retry a secure WhatsApp link that expires after 7 days. Only volunteers without email remain eligible. Email-based users can use Resend invitation or Forgot password.' },
      { heading: 'Duplicate phone records', text: 'Phone number is the identity key. New duplicates are blocked. If older records share a normalized phone, the Owner sees an orange duplicate panel in People > Volunteers with every matching name, email, status, and a label on each affected card.' },
    ], keywords: ['add volunteer', 'csv', 'bulk import', 'edit volunteer', 'resend invitation', 'assign'],
  },
  {
    id: 'admin-tasks', title: 'Creating tasks and recurring schedules', category: 'Administration', roles: ['admin', 'owner'],
    summary: 'Create standalone or event tasks, set capacity, recurrence, signup, and reminder timing.',
    sections: [
      { heading: 'Create a task', text: 'Open Tasks > Create & Manage. Provide a title and a current or future Eastern Time (ET) start; past times cannot be created or selected when rescheduling. Optionally add an event, description, end time, location, capacity, recurrence, and up to two reminder hours. One reminder may be any positive number; two must be at least 24 hours apart, such as 48 and 24.' },
      { heading: 'Recurring tasks', text: 'Daily, weekly, and monthly schedules generate dated occurrences ahead of time. Each occurrence can have different assigned volunteers. Choose whether an edit, cancellation, or Trash action affects one date or that date and future occurrences.' },
      { heading: 'Assignments', text: 'Select an eligible volunteer from the occurrence dropdown. Names appear immediately after a successful save. Remove someone to reopen capacity.' },
      { heading: 'Manual editing', text: 'Choose Edit Task on a dated occurrence to update its details without AI. For a recurring series, apply the changes only to that occurrence or to that date and all future occurrences.' },
      { heading: 'Admin self-service views', text: 'Browse & Sign Up shows available tasks with Sign me up or Withdraw myself. My Assignments shows the signed-in Admin or Owner commitments. Create & Manage contains the creation form and all management controls.' },
      { heading: 'Volunteer-created tasks', text: 'Volunteers may create only standalone, non-repeating tasks with one reminder. They can assign eligible people, edit their own task, and delete their own task. Admins and Owners can sign up for those tasks and manage them when necessary.' },
    ], keywords: ['create task', 'recurring', 'weekly', 'monthly', 'daily', 'reminder hours', 'assignment'],
  },
  {
    id: 'reminders', title: 'Automatic WhatsApp reminders and delivery', category: 'Notifications', roles: ['everyone'],
    summary: 'When task reminders run and what WhatsApp delivery requires.',
    sections: [
      { heading: 'Timing', text: 'Each task can store up to two reminder times, expressed as hours before its Eastern Time (ET) start. A single reminder may be scheduled at any positive number of hours before the task. When two reminders are configured, they must be at least 24 hours apart. Google Cloud Scheduler runs the sender hourly at 7 minutes past the hour. A two-hour recovery window catches slightly delayed runs, and duplicate protection sends each configured reminder only once.' },
      { heading: 'Eligibility', text: 'Cancelled, completed, and trashed tasks do not generate reminders. A volunteer must be assigned and have the relevant channel enabled with valid contact information.' },
      { heading: 'Channels', text: 'Automatic task reminders use WhatsApp and the approved task_reminder_hk_v4 template. Email does not have an automatic reminder checkbox. WhatsApp requires the configured Business account, sender number, access token, and approved template.' },
      { heading: 'WhatsApp safeguards', text: 'The app allows at most 100 WhatsApp sends per Eastern Time day and alerts the configured Owner number when usage reaches 50. The Owner can pause or resume all WhatsApp sending with the emergency control.' },
      { heading: 'Lifecycle and troubleshooting', text: 'Analytics records Accepted, Sent, Delivered, Read, and Failed provider updates. Read can remain blank when the recipient disables read receipts. A blocked recipient may remain undelivered or produce a provider failure; WhatsApp does not explicitly reveal that the person blocked the sender.' },
    ], keywords: ['automatic reminder', 'email', 'whatsapp', 'delivery', 'read', 'failed', 'template', 'provider', 'daily limit', 'pause'],
  },
  {
    id: 'events', title: 'Events, planning meetings, and templates', category: 'Events', roles: ['admin', 'owner'],
    summary: 'Organize tasks around events and preserve planning knowledge.',
    sections: [
      { heading: 'Event workspace', text: 'Create an event to group its tasks, planning notes, action items, and feedback. The event date is the scheduled date used for organization and template-based planning.' },
      { heading: 'Current events and history', text: 'Active event views show only current or future events. Past events are kept under History so operational screens stay focused without deleting records.' },
      { heading: 'Event owner', text: 'Each event may have one owner selected from the volunteer list. Imported events may initially have no owner and can be assigned later. Event ownership is separate from the Owner application role.' },
      { heading: 'Task window', text: 'Tasks linked to an event may span different working windows but must not be scheduled later than one day after the event finishes. Conflict alerts identify linked tasks outside the permitted event window and overlapping events.' },
      { heading: 'Created by filter', text: 'Event Workspace defaults to Created by me so each Admin can focus on events they created. Choose All admins to open the shared event list. This filter changes visibility only; Admin records remain collaborative rather than privately owned.' },
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
    id: 'event-calendar', title: 'Event Calendar and AI planner', category: 'Events', roles: ['volunteer', 'admin', 'owner'],
    summary: 'Review events across calendar views, detect conflicts, and use Owner planning controls.',
    sections: [
      { heading: 'Calendar views', text: 'Use year, month, week, or day view to review current and upcoming events. Search by event name, location, or description. Volunteers have read-only access; Admins can view the calendar; the Owner can use event management controls.' },
      { heading: 'Conflict alerts', text: 'The calendar flags overlapping event times, matching-location collisions, and linked tasks that fall outside their event window. Resolve alerts before confirming the schedule.' },
      { heading: 'Task-based reminders', text: 'Events do not broadcast one reminder to every participant. Reminders belong to linked tasks and go to the volunteers assigned to those tasks, using each task’s configured lead time.' },
      { heading: 'AI event planner', text: 'Describe an event addition, change, or deletion in plain language. Review the proposed actions and approve them before anything is saved. Ambiguous deletes are rejected.' },
    ], keywords: ['event calendar', 'year', 'month', 'week', 'day', 'event conflict', 'event reminder', 'ai event'],
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
      { heading: 'Admin cancellation and Trash', text: 'Admins and Owners can cancel work that will not happen, reopen it later, or move an incorrect record to Trash. Trash removes it from active views while keeping recovery available.' },
      { heading: 'Volunteer task deletion', text: 'A volunteer sees one Delete Task action for a task they created. They cannot delete another volunteer’s task. Volunteer deletion moves the owned task into the recoverable deletion flow rather than exposing separate Cancel and Delete choices.' },
      { heading: 'Admin boundary', text: 'Admins can cancel, reopen, and move tasks to Trash. They cannot restore or permanently delete trashed tasks.' },
      { heading: 'Owner recovery', text: 'The Owner can restore a task or a deleted group of recurring occurrences from Task Trash. Permanent deletion requires confirmation and cannot be undone. Trash is automatically purged after 30 days.' },
    ], keywords: ['delete', 'deleted', 'trash', 'task recovery', 'undo', 'restore', 'permanent', 'cancel', 'reopen', '30 days'],
  },
  {
    id: 'analytics', title: 'Analytics, filters, and planning decisions', category: 'Reports', roles: ['admin', 'owner'],
    summary: 'Use dashboard metrics and filters to identify coverage, participation, and planning needs.',
    sections: [
      { heading: 'Filters', text: 'Tasks is split into Browse & Sign Up, My Assignments, and Create & Manage. The management view can filter all tasks, tasks created by you, or tasks assigned to you, plus status, event, search, and sorting. Analytics has separate date, event, channel, and volunteer filters. Its WhatsApp reminders turned off section always shows every volunteer who opted out.' },
      { heading: 'Planning', text: 'Use open places and fill rates to identify staffing gaps, participation and hours to understand engagement, and event feedback to improve repeat events. Treat low activity as a prompt for outreach, not a judgment about a volunteer.' },
      { heading: 'Free-service capacity', text: 'The capacity table lists the current official free limits for supporting services. App-record estimates include a usage percentage and forecast where possible. Provider-only measurements are clearly identified and link to the corresponding service dashboard instead of showing a guessed value.' },
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
