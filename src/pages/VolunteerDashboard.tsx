import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth, db, isFirebaseConfigured } from '../config/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { isUserAdmin, VolunteerProfile, ServiceEvent, formatDate } from '../helpers/types';
import {
  clearDemoSession,
  ensureDemoVolunteer,
  getDemoEvents,
  getDemoSession,
  getDemoVolunteers,
} from '../helpers/demoStore';
import './VolunteerDashboard.css';

export const VolunteerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<(User | { uid: string; email: string; displayName: string }) | null>(null);
  const [events, setEvents] = useState<ServiceEvent[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [eventSearch, setEventSearch] = useState('');
  const [volunteerSearch, setVolunteerSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      const session = getDemoSession();
      if (!session) {
        navigate('/login');
      } else if (session.isAdmin) {
        navigate('/admin');
      } else {
        setUser({
          uid: session.uid,
          email: session.email,
          displayName: session.displayName,
        });
        ensureDemoVolunteer(session);
        loadVolunteerData();
        setLoading(false);
      }
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check if user is admin - redirect if they are
        const admin = await isUserAdmin(currentUser);
        if (admin) {
          navigate('/admin');
          return;
        }

        await loadVolunteerData();
      } else {
        navigate('/login');
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [navigate]);

  const loadVolunteerData = async () => {
    try {
      if (!isFirebaseConfigured) {
        setEvents(getDemoEvents());
        setVolunteers(getDemoVolunteers());
        return;
      }

      const eventsSnapshot = await getDocs(collection(db, 'serviceEvents'));
      const eventsData = eventsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        eventDateTime: doc.data().eventDateTime?.toDate?.() || new Date(),
      } as ServiceEvent));

      const volunteersSnapshot = await getDocs(collection(db, 'volunteers'));
      const volunteersData = volunteersSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          uid: doc.id,
          name: data.name,
          email: data.email,
          phoneNumber: data.phoneNumber,
          address: data.address || '',
          assignedEvents: data.assignedEvents || [],
          availableHours: data.availableHours || 0,
          joinedDate: data.joinedDate?.toDate?.() || new Date(),
        } as VolunteerProfile;
      });

      setEvents(eventsData);
      setVolunteers(volunteersData);
    } catch (error) {
      console.error('Error loading volunteer data:', error);
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

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.eventDateTime).getTime() - new Date(b.eventDateTime).getTime()
  );
  const filteredEvents = sortedEvents.filter((event) => {
    const query = eventSearch.trim().toLowerCase();
    if (!query) return true;
    return event.topic.toLowerCase().includes(query);
  });
  const filteredVolunteers = volunteers.filter((volunteer) => {
    const query = volunteerSearch.trim().toLowerCase();
    if (!query) return true;
    return volunteer.name.toLowerCase().includes(query);
  });

  return (
    <div className="volunteer-dashboard">
      <header className="dashboard-header">
        <h1>Volunteer Dashboard</h1>
        <div className="header-actions">
          <span className="user-info">{user?.email}</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="events-section">
          <h2>Events</h2>
          <div className="list-toolbar">
            <input
              type="search"
              placeholder="Search events..."
              value={eventSearch}
              onChange={(e) => setEventSearch(e.target.value)}
            />
            <span>Sorted by closest date</span>
          </div>
          
          {filteredEvents.length === 0 ? (
            <div className="empty-state">
              <p>No events are available yet.</p>
            </div>
          ) : (
            <div className="events-list">
              {filteredEvents.map((event) => (
                <div key={event.id} className="event-card">
                  <div className="event-header">
                    <h3>{event.topic}</h3>
                    <span className={`status ${event.status}`}>{event.status}</span>
                  </div>
                  
                  {event.description && (
                    <p className="event-description">{event.description}</p>
                  )}
                  
                  <div className="event-details">
                    <div className="detail-item">
                      <strong>Date & Time:</strong>
                      <span>{formatDate(event.eventDateTime)}</span>
                    </div>
                    
                    {event.location && (
                      <div className="detail-item">
                        <strong>Location:</strong>
                        <span>{event.location}</span>
                      </div>
                    )}
                    
                    <div className="detail-item">
                      <strong>Total Volunteers:</strong>
                      <span>{event.assignedVolunteers?.length || 0}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="volunteers-section">
          <h2>Volunteers</h2>
          <div className="list-toolbar">
            <input
              type="search"
              placeholder="Search volunteers..."
              value={volunteerSearch}
              onChange={(e) => setVolunteerSearch(e.target.value)}
            />
          </div>

          {filteredVolunteers.length === 0 ? (
            <div className="empty-state">
              <p>No volunteers are available yet.</p>
            </div>
          ) : (
            <div className="volunteers-list">
              {filteredVolunteers.map((volunteer) => {
                const assignedEventNames = (volunteer.assignedEvents || [])
                  .map((eventId) => events.find((event) => event.id === eventId)?.topic)
                  .filter(Boolean);

                return (
                  <div key={volunteer.uid} className="volunteer-card">
                    <h3>{volunteer.name}</h3>
                    <p><strong>Email:</strong> {volunteer.email}</p>
                    <p><strong>Phone:</strong> {volunteer.phoneNumber}</p>
                    <p><strong>Assigned events:</strong> {assignedEventNames.length ? assignedEventNames.join(', ') : 'None yet'}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VolunteerDashboard;
