import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth, db, functions, isFirebaseConfigured } from '../config/firebase';
import { collection, addDoc, getDocs, Timestamp, updateDoc, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { isUserAdmin, ServiceEvent, formatDate } from '../helpers/types';
import {
  clearDemoSession,
  getDemoEvents,
  getDemoSession,
  getDemoVolunteers,
  saveDemoEvents,
  saveDemoVolunteers,
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
  const [activeTab, setActiveTab] = useState<'events' | 'volunteers' | 'reminders'>('events');
  
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
      const session = getDemoSession();
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
        password: newVolunteer.password,
        phoneNumber: newVolunteer.phoneNumber,
        address: newVolunteer.address,
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
        <h1>Admin Dashboard</h1>
        <div className="header-actions">
          <span className="user-info">{user?.email}</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          Events
        </button>
        <button
          className={`tab ${activeTab === 'volunteers' ? 'active' : ''}`}
          onClick={() => setActiveTab('volunteers')}
        >
          Volunteers
        </button>
        <button
          className={`tab ${activeTab === 'reminders' ? 'active' : ''}`}
          onClick={() => setActiveTab('reminders')}
        >
          SMS Reminders
        </button>
      </nav>

      <div className="dashboard-content">
        {/* Events Tab */}
        {activeTab === 'events' && (
          <div className="tab-content">
            <h2>Service Events</h2>
            
            <div className="form-section">
              <h3>Create New Event</h3>
              <form onSubmit={handleCreateEvent}>
                <input
                  type="text"
                  placeholder="Event Topic"
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

            <div className="events-list">
              {events.map((event) => (
                <div key={event.id} className="event-card">
                  <div className="card-title-row">
                    <h4>{event.topic}</h4>
                    <button
                      type="button"
                      className="danger-btn"
                      onClick={() => handleDeleteEvent(event.id, event.topic)}
                    >
                      Delete
                    </button>
                  </div>
                  <p><strong>Date:</strong> {formatDate(event.eventDateTime)}</p>
                  <p><strong>Location:</strong> {event.location || 'N/A'}</p>
                  <p><strong>Assigned Volunteers:</strong> {event.assignedVolunteers?.length || 0}</p>
                  <label>
                    Status
                    <select
                      value={event.status}
                      onChange={(e) =>
                        handleUpdateEventStatus(event.id, e.target.value as ServiceEvent['status'])
                      }
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="ongoing">Ongoing</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Volunteers Tab */}
        {activeTab === 'volunteers' && (
          <div className="tab-content">
            <h2>Volunteers</h2>
            <div className="form-section">
              <h3>Add New Volunteer</h3>
              <form onSubmit={handleCreateVolunteer} className="admin-form">
                <input
                  type="text"
                  placeholder="Full Name"
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
                  placeholder="Phone Number"
                  value={newVolunteer.phoneNumber}
                  onChange={(e) => setNewVolunteer({...newVolunteer, phoneNumber: e.target.value})}
                  required
                />
                <input
                  type="text"
                  placeholder="Address"
                  value={newVolunteer.address}
                  onChange={(e) => setNewVolunteer({...newVolunteer, address: e.target.value})}
                />
                <input
                  type="password"
                  placeholder="Temporary Password"
                  value={newVolunteer.password}
                  onChange={(e) => setNewVolunteer({...newVolunteer, password: e.target.value})}
                  required
                />
                <button type="submit">Create Volunteer</button>
              </form>
            </div>

            <div className="volunteers-list">
              {volunteers.map((volunteer) => (
                <div key={volunteer.id} className="volunteer-card">
                  <div className="card-title-row">
                    <h4>{volunteer.name}</h4>
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
                  <p><strong>Address:</strong> {volunteer.address || 'N/A'}</p>
                  
                  <div className="volunteer-actions">
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAssignVolunteer(e.target.value, volunteer.id);
                          e.target.value = '';
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="">Assign to Event...</option>
                      {events.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.topic}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reminders Tab */}
        {activeTab === 'reminders' && (
          <div className="tab-content">
            <h2>SMS Reminders Configuration</h2>
            
            <div className="form-section">
              <h3>Create SMS Reminders for Event</h3>
              <form onSubmit={handleCreateReminders}>
                <select
                  value={reminderConfig.eventId}
                  onChange={(e) => setReminderConfig({...reminderConfig, eventId: e.target.value})}
                  required
                >
                  <option value="">Select Event</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.topic} - {formatDate(event.eventDateTime)}
                    </option>
                  ))}
                </select>

                <label>
                  Hours Before Event:
                  <input
                    type="number"
                    value={reminderConfig.hoursBeforeEvent}
                    onChange={(e) => setReminderConfig({...reminderConfig, hoursBeforeEvent: parseInt(e.target.value)})}
                    min="1"
                    max="168"
                    required
                  />
                </label>

                <label>
                  Message:
                  <textarea
                    value={reminderConfig.message}
                    onChange={(e) => setReminderConfig({...reminderConfig, message: e.target.value})}
                    placeholder="Enter SMS message"
                    rows={3}
                    required
                  />
                </label>

                <button type="submit">Create Reminders for All Assigned Volunteers</button>
              </form>
            </div>

            <p className="reminder-info">
              This will create SMS reminders for all volunteers assigned to the selected event.
              Reminders will be automatically sent {reminderConfig.hoursBeforeEvent} hours before the event time.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
