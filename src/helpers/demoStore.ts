import { ServiceEvent, VolunteerProfile } from './types';

const SESSION_KEY = 'volunteerApp_demoSession';
const EVENTS_KEY = 'volunteerApp_demoEvents';
const VOLUNTEERS_KEY = 'volunteerApp_demoVolunteers';

export interface DemoSession {
  uid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
}

export type DemoVolunteer = VolunteerProfile & { id: string };

const initialEvents: ServiceEvent[] = [
  {
    id: 'event-community-cleanup',
    topic: 'Community Cleanup',
    description: 'Help clean up the neighborhood park and sort donated supplies.',
    eventDateTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    location: 'Central Park',
    assignedVolunteers: ['volunteer-demo'],
    status: 'scheduled',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'event-food-pantry',
    topic: 'Food Pantry Shift',
    description: 'Pack grocery bags and assist visitors during pantry hours.',
    eventDateTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    location: 'Downtown Community Center',
    assignedVolunteers: [],
    status: 'scheduled',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const initialVolunteers: DemoVolunteer[] = [
  {
    id: 'volunteer-demo',
    uid: 'volunteer-demo',
    name: 'Demo Volunteer',
    email: 'volunteer@example.com',
    phoneNumber: '+15551234567',
    address: '123 Main St',
    availableHours: 0,
    joinedDate: new Date(),
  },
];

function parseDateFields<T>(item: T): T {
  const record = item as Record<string, unknown>;

  return {
    ...record,
    eventDateTime: record.eventDateTime ? new Date(record.eventDateTime as string) : record.eventDateTime,
    createdAt: record.createdAt ? new Date(record.createdAt as string) : record.createdAt,
    updatedAt: record.updatedAt ? new Date(record.updatedAt as string) : record.updatedAt,
    joinedDate: record.joinedDate ? new Date(record.joinedDate as string) : record.joinedDate,
  } as T;
}

function readCollection<T>(key: string, fallback: T[]): T[] {
  const stored = localStorage.getItem(key);
  if (!stored) {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }

  try {
    return JSON.parse(stored).map(parseDateFields) as T[];
  } catch {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
}

function writeCollection<T>(key: string, value: T[]) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getDemoSession() {
  const stored = localStorage.getItem(SESSION_KEY);
  return stored ? (JSON.parse(stored) as DemoSession) : null;
}

export function setDemoSession(email: string, name?: string, forceAdmin?: boolean) {
  const isAdmin = forceAdmin ?? email === 'admin123';
  const session: DemoSession = {
    uid: isAdmin ? 'admin-demo' : 'volunteer-demo',
    email,
    displayName: name || (isAdmin ? 'Demo Admin' : 'Demo Volunteer'),
    isAdmin,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearDemoSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getDemoEvents() {
  return readCollection<ServiceEvent>(EVENTS_KEY, initialEvents);
}

export function saveDemoEvents(events: ServiceEvent[]) {
  writeCollection(EVENTS_KEY, events);
}

export function getDemoVolunteers() {
  return readCollection<DemoVolunteer>(VOLUNTEERS_KEY, initialVolunteers);
}

export function saveDemoVolunteers(volunteers: DemoVolunteer[]) {
  writeCollection(VOLUNTEERS_KEY, volunteers);
}

export function ensureDemoVolunteer(session: DemoSession, phoneNumber = '+15551234567') {
  const volunteers = getDemoVolunteers();
  const existing = volunteers.find((volunteer) => volunteer.uid === session.uid);
  if (existing) return existing;

  const volunteer: DemoVolunteer = {
    id: session.uid,
    uid: session.uid,
    name: session.displayName,
    email: session.email,
    phoneNumber,
    address: '',
    availableHours: 0,
    joinedDate: new Date(),
  };
  saveDemoVolunteers([...volunteers, volunteer]);
  return volunteer;
}
