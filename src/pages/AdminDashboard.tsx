import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth, db, functions, isFirebaseConfigured } from '../config/firebase';
import { collection, addDoc, getDocs, Timestamp, updateDoc, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { isUserAdmin, ReminderRule, ServiceEvent, formatDate } from '../helpers/types';
import {
  clearDemoSession,
  getDemoEvents,
  getDemoSession,
  getDemoVolunteers,
  saveDemoEvents,
  saveDemoVolunteers,
  setDemoSession,
} from '../helpers/demoStore';
import './AdminDashboard.css';

interface VolunteerRecord {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  address?: string;
}

interface CreateVolunteerResult {
  uid: string;
}

interface CreateRemindersResult {
  remindersCreated: number;
}

interface DeleteVolunteerResult {
  authDeleted?: boolean;
  authDeletionError?: string;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<(User | { email: string }) | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<ServiceEvent[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerRecord[]>([]);
  const [reminderRules, setReminderRules] = useState<ReminderRule[]>([]);
  
  // Event form state
  const [newEvent, setNewEvent] = useState({
    topic: '',
    description: '',
    eventDateTime: '',
    location: '',
  });

  // Volunteer creation state
  const [newVolunteer, setNewVolunteer] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    address: '',
    password: '',
  });

  // Reminder form state
  const [reminderConfig, setReminderConfig] = useState({
    eventId: '',
    hoursBeforeEvent: 24,
    message: 'Reminder: You have a volunteer event coming up!',
  });

  useEffect(() => {
    if (!isFirebaseConfigured) {
      const session = getDemoSession() || setDemoSession('admin@example.com', 'Demo Admin');
      if (!session) {
        navigate('/login');
      } else if (!session.isAdmin) {
        navigate('/dashboard');
      } else {
        setUser({ email: session.email });
        setIsAdmin(true);
        loadData();
        setLoading(false);
      }
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const admin = await isUserAdmin(currentUser);
        if (!admin) {
          navigate('/dashboard');
        } else {
          setIsAdmin(true);
          await loadData();
        }
      } else {
        navigate('/login');
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [navigate]);

  const loadData = async () => {
    try {
      if (!isFirebaseConfigured) {
        setEvents(getDemoEvents());
        setVolunteers(getDemoVolunteers());
        setReminderRules([]);
        return;
      }

      // Load events
      const eventsSnapshot = await getDocs(collection(db, 'serviceEvents'));
      const eventsData = eventsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        eventDateTime: doc.data().eventDateTime?.toDate?.() || new Date(),
      } as ServiceEvent));
      setEvents(eventsData);

      // Load volunteers
      const volunteersSnapshot = await getDocs(collection(db, 'volunteers'));
      const volunteersData = volunteersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as VolunteerRecord));
      setVolunteers(volunteersData);

      const reminderRulesSnapshot = await getDocs(collection(db, 'reminderRules'));
      const reminderRulesData = reminderRulesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
      } as ReminderRule));
      setReminderRules(reminderRulesData);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (!isFirebaseConfigured) {
        const createdEvent: ServiceEvent = {
          id: `event-${Date.now()}`,
          topic: newEvent.topic,
          description: newEvent.description,
          eventDateTime: new Date(newEvent.eventDateTime),
          location: newEvent.location,
          assignedVolunteers: [],
          status: 'scheduled',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        saveDemoEvents([...getDemoEvents(), createdEvent]);
        setNewEvent({ topic: '', description: '', eventDateTime: '', location: '' });
        await loadData();
        alert('Event created successfully!');
        return;
      }

      await addDoc(collection(db, 'serviceEvents'), {
        topic: newEvent.topic,
        description: newEvent.description,
        eventDateTime: Timestamp.fromDate(new Date(newEvent.eventDateTime)),
        location: newEvent.location,
        assignedVolunteers: [],
        status: 'scheduled',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      setNewEvent({
        topic: '',
        description: '',
        eventDateTime: '',
        location: '',
      });

      await loadData();
      alert('Event created successfully!');
    } catch (error) {
      console.error('Error creating event:', error);
      alert('Failed to create event');
    }
  };

  const handleAssignVolunteer = async (eventId: string, volunteerId: string) => {
    try {
      if (!isFirebaseConfigured) {
        const events = getDemoEvents();
        const updatedEvents = events.map((event) =>
          event.id === eventId && !event.assignedVolunteers.includes(volunteerId)
            ? { ...event, assignedVolunteers: [...event.assignedVolunteers, volunteerId], updatedAt: new Date() }
            : event
        );
        saveDemoEvents(updatedEvents);
        await loadData();
        alert('Volunteer assigned!');
        return;
      }

      const eventRef = doc(db, 'serviceEvents', eventId);
      const eventDoc = await getDoc(eventRef);
      const assignedVolunteers = eventDoc.data()?.assignedVolunteers || [];

      if (!assignedVolunteers.includes(volunteerId)) {
        await updateDoc(eventRef, {
          assignedVolunteers: [...assignedVolunteers, volunteerId],
        });
        alert('Volunteer assigned!');
        await loadData();
      } else {
        alert('Volunteer already assigned to this event');
      }
    } catch (error) {
      console.error('Error assigning volunteer:', error);
      alert('Failed to assign volunteer');
    }
  };

  const handleUpdateEventStatus = async (eventId: string, status: ServiceEvent['status']) => {
    try {
      if (!isFirebaseConfigured) {
        saveDemoEvents(
          getDemoEvents().map((event) =>
            event.id === eventId ? { ...event, status, updatedAt: new Date() } : event
          )
        );
        await loadData();
        return;
      }

      await updateDoc(doc(db, 'serviceEvents', eventId), {
        status,
        updatedAt: Timestamp.now(),
      });
      await loadData();
    } catch (error) {
      console.error('Error updating event status:', error);
      alert('Failed to update event status');
    }
  };

  const handleDeleteEvent = async (eventId: string, topic: string) => {
    const confirmed = window.confirm(
      `Delete "${topic}"? This also removes reminder records for this event.`
    );
    if (!confirmed) return;

    try {
      if (!isFirebaseConfigured) {
        saveDemoEvents(getDemoEvents().filter((event) => event.id !== eventId));
        await loadData();
        alert('Event deleted.');
        return;
      }

      const deleteEventFunction = httpsCallable(functions, 'deleteServiceEvent');
      await deleteEventFunction({ eventId });
      await loadData();
      alert('Event deleted.');
    } catch (error) {
      console.error('Error deleting event:', error);
      alert(`Failed to delete event: ${getErrorMessage(error, 'Unknown error')}`);
    }
  };

  const handleDeleteVolunteer = async (volunteerId: string, name: string) => {
    const confirmed = window.confirm(
      `Remove ${name}? This deletes their volunteer profile, removes them from events, and deletes their Auth account.`
    );
    if (!confirmed) return;

    try {
      if (!isFirebaseConfigured) {
        saveDemoVolunteers(getDemoVolunteers().filter((volunteer) => volunteer.id !== volunteerId));
        saveDemoEvents(
          getDemoEvents().map((event) => ({
            ...event,
            assignedVolunteers: event.assignedVolunteers.filter((id) => id !== volunteerId),
          }))
        );
        await loadData();
        alert('Volunteer removed.');
        return;
      }

      const deleteVolunteerFunction = httpsCallable(functions, 'deleteVolunteer');
      const result = await deleteVolunteerFunction({ volunteerId });
      await loadData();

      const data = result.data as DeleteVolunteerResult;
      if (data.authDeleted === false) {
        alert(`Volunteer removed, but Auth deletion failed: ${data.authDeletionError}`);
      } else {
        alert('Volunteer removed.');
      }
    } catch (error) {
      console.error('Error deleting volunteer:', error);
      alert(`Failed to remove volunteer: ${getErrorMessage(error, 'Unknown error')}`);
    }
  };

  const handleCreateVolunteer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (!isFirebaseConfigured) {
        const volunteer: VolunteerRecord = {
          id: `volunteer-${Date.now()}`,
          name: newVolunteer.name,
          email: newVolunteer.email,
          phoneNumber: newVolunteer.phoneNumber,
          address: newVolunteer.address,
        };
        saveDemoVolunteers([
          ...getDemoVolunteers(),
          { ...volunteer, uid: volunteer.id, availableHours: 0, joinedDate: new Date() },
        ]);
        setNewVolunteer({ name: '', email: '', phoneNumber: '', address: '', password: '' });
        await loadData();
        alert(`Volunteer created successfully! UID: ${volunteer.id}`);
        return;
      }

      const createVolunteerFunction = httpsCallable(functions, 'createVolunteer');
      const result = await createVolunteerFunction({
        name: newVolunteer.name,
        email: newVolunteer.email,
        password: newVolunteer.password || 'TempPass123!',
        phoneNumber: newVolunteer.phoneNumber,
        address: newVolunteer.address || '',
      });

      console.log('Volunteer created:', result);
      const data = result.data as CreateVolunteerResult;
      alert(`Volunteer created successfully! UID: ${data.uid}`);
      setNewVolunteer({
        name: '',
        email: '',
        phoneNumber: '',
        address: '',
        password: '',
      });
      await loadData();
    } catch (error) {
      console.error('Error creating volunteer:', error);
      alert(`Failed to create volunteer: ${getErrorMessage(error, 'Unknown error')}`);
    }
  };

  const handleCreateReminders = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (!isFirebaseConfigured) {
        setReminderRules((rules) => [
          ...rules.filter((rule) => rule.eventId !== reminderConfig.eventId),
          {
            id: `rule-${reminderConfig.eventId}`,
            eventId: reminderConfig.eventId,
            hoursBeforeEvent: reminderConfig.hoursBeforeEvent,
            message: reminderConfig.message,
            createdAt: new Date(),
          },
        ]);
        alert('Demo reminders created. SMS sending requires a real Firebase and Twilio setup.');
        setReminderConfig({
          eventId: '',
          hoursBeforeEvent: 24,
          message: 'Reminder: You have a volunteer event coming up!',
        });
        return;
      }

      const createRemindersFunction = httpsCallable(functions, 'createRemindersForEvent');
      const result = await createRemindersFunction({
        eventId: reminderConfig.eventId,
        hoursBeforeEvent: reminderConfig.hoursBeforeEvent,
        message: reminderConfig.message,
      });

      console.log('Reminders created:', result);
      const data = result.data as CreateRemindersResult;
      alert(`Reminders created! (${data.remindersCreated} reminders)`);
      await loadData();
      
      setReminderConfig({
        eventId: '',
        hoursBeforeEvent: 24,
        message: 'Reminder: You have a volunteer event coming up!',
      });
    } catch (error) {
      console.error('Error creating reminders:', error);
      alert(`Failed to create reminders: ${getErrorMessage(error, 'Unknown error')}`);
    }
  };

  const handleLogout = async () => {
    try {
      if (!isFirebaseConfigured) {
        clearDemoSession();
        navigate('/login');
        return;
      }

      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAdmin) {
    return <div className="error">Unauthorized access</div>;
  }

  return (
    <div className="admin-dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Temple Volunteers</h1>
          <p>Service events, assignments, profiles, and SMS reminders</p>
        </div>
        <div className="header-actions">
          <span className="user-info">{user?.email}</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </header>

      <div className="dashboard-content">
        <section className="admin-columns">
          <div className="form-section">
            <h2>Create Event</h2>
            <form onSubmit={handleCreateEvent}>
              <input
                type="text"
                placeholder="Event topic"
                value={newEvent.topic}
                onChange={(e) => setNewEvent({...newEvent, topic: e.target.value})}
                required
              />
              <input
                type="text"
                placeholder="Description"
                value={newEvent.description}
                onChange={(e) => setNewEvent({...newEvent, description: e.target.value})}
              />
              <input
                type="datetime-local"
                value={newEvent.eventDateTime}
                onChange={(e) => setNewEvent({...newEvent, eventDateTime: e.target.value})}
                required
              />
              <input
                type="text"
                placeholder="Location"
                value={newEvent.location}
                onChange={(e) => setNewEvent({...newEvent, location: e.target.value})}
              />
              <button type="submit">Create Event</button>
            </form>
          </div>

          <div className="form-section">
            <h2>Add Volunteer</h2>
            <form onSubmit={handleCreateVolunteer}>
              <input
                type="text"
                placeholder="Full name"
                value={newVolunteer.name}
                onChange={(e) => setNewVolunteer({...newVolunteer, name: e.target.value})}
                required
              />
              <input
                type="email"
                placeholder="Email"
                value={newVolunteer.email}
                onChange={(e) => setNewVolunteer({...newVolunteer, email: e.target.value})}
                required
              />
              <input
                type="tel"
                placeholder="Phone number"
                value={newVolunteer.phoneNumber}
                onChange={(e) => setNewVolunteer({...newVolunteer, phoneNumber: e.target.value})}
                required
              />
              <button type="submit">Create Volunteer</button>
            </form>
          </div>

          <div className="form-section">
            <h2>Reminder Rule</h2>
            <form onSubmit={handleCreateReminders}>
              <select
                value={reminderConfig.eventId}
                onChange={(e) => setReminderConfig({...reminderConfig, eventId: e.target.value})}
                required
              >
                <option value="">Select event</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.topic}
                  </option>
                ))}
              </select>
              <label>
                Hours before event
                <input
                  type="number"
                  value={reminderConfig.hoursBeforeEvent}
                  onChange={(e) => setReminderConfig({...reminderConfig, hoursBeforeEvent: parseInt(e.target.value, 10)})}
                  min="1"
                  max="168"
                  required
                />
              </label>
              <label>
                Message
                <textarea
                  value={reminderConfig.message}
                  onChange={(e) => setReminderConfig({...reminderConfig, message: e.target.value})}
                  rows={4}
                  required
                />
              </label>
              <button type="submit">Create Reminders</button>
            </form>
          </div>
        </section>

        <section className="records-section">
          <h2>Events</h2>
          <div className="events-list">
            {events.map((event) => {
              const assignedNames = (event.assignedVolunteers || [])
                .map((id) => volunteers.find((volunteer) => volunteer.id === id)?.name)
                .filter(Boolean);

              return (
                <div key={event.id} className="event-card">
                  <div className="card-title-row">
                    <h3>{event.topic}</h3>
                    <button
                      type="button"
                      className="danger-btn"
                      onClick={() => handleDeleteEvent(event.id, event.topic)}
                    >
                      Delete
                    </button>
                  </div>
                  <p>{event.description || 'No description yet.'}</p>
                  <p><strong>Date:</strong> {formatDate(event.eventDateTime)}</p>
                  <p><strong>Location:</strong> {event.location || 'N/A'}</p>
                  <p><strong>Assigned volunteers:</strong> {assignedNames.length ? assignedNames.join(', ') : 'None yet'}</p>
                  <label>
                    Assign existing volunteer
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAssignVolunteer(event.id, e.target.value);
                          e.target.value = '';
                        }
                      }}
                    >
                      <option value="">Choose volunteer...</option>
                      {volunteers.map((volunteer) => (
                        <option key={volunteer.id} value={volunteer.id}>
                          {volunteer.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Status
                    <select
                      value={event.status}
                      onChange={(e) =>
                        handleUpdateEventStatus(event.id, e.target.value as ServiceEvent['status'])
                      }
                    >
                      <option value="scheduled">scheduled</option>
                      <option value="ongoing">ongoing</option>
                      <option value="completed">completed</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </label>
                </div>
              );
            })}
          </div>
        </section>

        <section className="records-section">
          <h2>Volunteers</h2>
          <div className="volunteers-list">
            {volunteers.map((volunteer) => (
              <div key={volunteer.id} className="volunteer-card">
                <div className="card-title-row">
                  <h3>{volunteer.name}</h3>
                  <button
                    type="button"
                    className="danger-btn"
                    onClick={() => handleDeleteVolunteer(volunteer.id, volunteer.name)}
                  >
                    Remove
                  </button>
                </div>
                <p><strong>Email:</strong> {volunteer.email}</p>
                <p><strong>Phone:</strong> {volunteer.phoneNumber}</p>
                <label>
                  Assign event to volunteer
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAssignVolunteer(e.target.value, volunteer.id);
                        e.target.value = '';
                      }
                    }}
                  >
                    <option value="">Choose event...</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.topic}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
        </section>

        <section className="records-section">
          <h2>Reminder Rules</h2>
          <div className="reminder-rules-list">
            {reminderRules.length === 0 ? (
              <p className="empty">No reminder rules yet.</p>
            ) : (
              reminderRules.map((rule) => (
                <div key={rule.id} className="reminder-card">
                  <h3>{events.find((event) => event.id === rule.eventId)?.topic || 'Deleted event'}</h3>
                  <p><strong>Hours before event:</strong> {rule.hoursBeforeEvent}</p>
                  <p>{rule.message}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminDashboard;
