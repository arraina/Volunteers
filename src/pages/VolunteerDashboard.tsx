import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, onAuthStateChanged, User } from 'firebase/auth';
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../config/firebase';
import {
  EventService,
  ServiceAssignment,
  ServiceEvent,
  ServiceTimeSlot,
  VolunteerProfile,
  buildServiceSlots,
  formatDate,
  formatTime,
  isUserAdmin,
} from '../helpers/types';
import {
  clearDemoSession,
  ensureDemoVolunteer,
  getDemoEvents,
  getDemoSession,
  getDemoVolunteers,
  saveDemoVolunteers,
} from '../helpers/demoStore';
import './VolunteerDashboard.css';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const VolunteerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<(User | { uid: string; email: string; displayName: string }) | null>(null);
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [events, setEvents] = useState<ServiceEvent[]>([]);
  const [services, setServices] = useState<EventService[]>([]);
  const [assignments, setAssignments] = useState<ServiceAssignment[]>([]);
  const [eventSearch, setEventSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
  });

  useEffect(() => {
    if (!isFirebaseConfigured) {
      const session = getDemoSession();
      if (!session) {
        navigate('/login');
      } else if (session.isAdmin) {
        navigate('/admin');
      } else {
        setUser(session);
        ensureDemoVolunteer(session);
        loadVolunteerData(session.uid, session.email);
        setLoading(false);
      }
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        navigate('/login');
        setLoading(false);
        return;
      }

      if (await isUserAdmin(currentUser)) {
        navigate('/admin');
        return;
      }

      setUser(currentUser);
      await loadVolunteerData(currentUser.uid, currentUser.email || '');
      setLoading(false);
    });

    return unsubscribe;
  }, [navigate]);

  const loadVolunteerData = async (uid: string, emailAddress = '') => {
    try {
      setLoadError('');
      if (!isFirebaseConfigured) {
        const demoProfile = getDemoVolunteers().find((volunteer) => volunteer.uid === uid) || null;
        setProfile(demoProfile);
        setEvents(getDemoEvents());
        setServices([]);
        setAssignments([]);
        return;
      }

      const profileDoc = await getDoc(doc(db, 'volunteers', uid));
      const userEmail = emailAddress.trim().toLowerCase();
      let loadedProfile: VolunteerProfile | null = null;

      if (profileDoc.exists()) {
        const profileData = profileDoc.data();
        loadedProfile = {
          uid: profileDoc.id,
          ...profileData,
          joinedDate: profileData.joinedDate?.toDate?.() || new Date(),
        } as VolunteerProfile;
      } else if (userEmail) {
        const matchingProfiles = await getDocs(
          query(collection(db, 'volunteers'), where('email', '==', userEmail))
        );
        const matchingProfileDoc = matchingProfiles.docs[0];
        if (matchingProfileDoc) {
          const profileData = matchingProfileDoc.data();
          loadedProfile = {
            uid: matchingProfileDoc.id,
            ...profileData,
            joinedDate: profileData.joinedDate?.toDate?.() || new Date(),
          } as VolunteerProfile;
        }
      }

      setProfile(loadedProfile);
      setProfileForm({
        firstName: loadedProfile?.firstName || loadedProfile?.name?.split(' ')[0] || '',
        lastName: loadedProfile?.lastName || loadedProfile?.name?.split(' ').slice(1).join(' ') || '',
        phoneNumber: loadedProfile?.phoneNumber === 'Not provided' ? '' : loadedProfile?.phoneNumber || '',
      });

      const eventsSnapshot = await getDocs(collection(db, 'serviceEvents'));
      setEvents(eventsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        eventDateTime: doc.data().eventDateTime?.toDate?.() || new Date(),
      } as ServiceEvent)));

      const servicesSnapshot = await getDocs(collection(db, 'services'));
      setServices(servicesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
      } as EventService)));

      const assignmentsSnapshot = await getDocs(
        query(collection(db, 'serviceAssignments'), where('volunteerId', '==', loadedProfile?.uid || uid))
      );
      setAssignments(assignmentsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
      } as ServiceAssignment)));

    } catch (error) {
      console.error('Error loading volunteer data:', error);
      setLoadError(getErrorMessage(error, 'Unable to load volunteer dashboard data.'));
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    try {
      const firstName = profileForm.firstName.trim();
      const lastName = profileForm.lastName.trim();
      const phoneNumber = profileForm.phoneNumber.trim();

      if (!firstName || !lastName || !phoneNumber) {
        throw new Error('First name, last name, and phone are required.');
      }

      if (!isFirebaseConfigured) {
        saveDemoVolunteers(
          getDemoVolunteers().map((volunteer) =>
            volunteer.uid === profile.uid
              ? { ...volunteer, firstName, lastName, name: `${firstName} ${lastName}`, phoneNumber }
              : volunteer
          )
        );
        await loadVolunteerData(user.uid, user.email || '');
        alert('Profile updated.');
        return;
      }

      await updateDoc(doc(db, 'volunteers', profile.uid), {
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        phoneNumber,
        updatedAt: Timestamp.now(),
      });
      await loadVolunteerData(user.uid, user.email || '');
      alert('Profile updated.');
    } catch (error) {
      alert(getErrorMessage(error, 'Unable to update profile'));
    }
  };

  const handleAssignService = async (eventId: string, serviceId: string, slot: ServiceTimeSlot) => {
    if (!user || !profile) return;

    const service = services.find((item) => item.id === serviceId);
    const event = events.find((item) => item.id === eventId);
    const serviceLabel = service?.name || 'this service';
    const eventLabel = event?.topic ? ` for ${event.topic}` : '';
    if (!window.confirm(`Sign up for ${serviceLabel}${eventLabel} at ${slot.label}?`)) return;

    try {
      if (!isFirebaseConfigured) {
        saveDemoVolunteers(
          getDemoVolunteers().map((volunteer) =>
            volunteer.uid === user.uid
              ? {
                  ...volunteer,
                  assignedEvents: Array.from(new Set([...(volunteer.assignedEvents || []), eventId])),
                  assignedServices: Array.from(new Set([...(volunteer.assignedServices || []), serviceId])),
                }
              : volunteer
          )
        );
        await loadVolunteerData(user.uid, user.email || '');
        alert(`You are signed up for ${serviceLabel} at ${slot.label}.`);
        return;
      }

      const assignmentId = `${eventId}_${serviceId}_${slot.key}_${profile.uid}`;
      await setDoc(doc(db, 'serviceAssignments', assignmentId), {
        eventId,
        serviceId,
        slotKey: slot.key,
        slotStartTime: slot.startTime,
        slotEndTime: slot.endTime,
        volunteerId: profile.uid,
        volunteerName: profile.name,
        volunteerEmail: profile.email,
        createdAt: Timestamp.now(),
      });
      await updateDoc(doc(db, 'volunteers', profile.uid), {
        assignedEvents: arrayUnion(eventId),
        assignedServices: arrayUnion(serviceId),
        updatedAt: Timestamp.now(),
      });
      await loadVolunteerData(user.uid, user.email || '');
      alert(`You are signed up for ${serviceLabel} at ${slot.label}.`);
    } catch (error) {
      alert(getErrorMessage(error, 'Unable to select service'));
    }
  };

  const handleRemoveService = async (assignment: ServiceAssignment) => {
    if (!user || !profile) return;

    try {
      if (!isFirebaseConfigured) {
        saveDemoVolunteers(
          getDemoVolunteers().map((volunteer) =>
            volunteer.uid === user.uid
              ? {
                  ...volunteer,
                  assignedServices: (volunteer.assignedServices || []).filter((serviceId) => serviceId !== assignment.serviceId),
                  assignedEvents: (volunteer.assignedEvents || []).filter((eventId) => eventId !== assignment.eventId),
                }
              : volunteer
          )
        );
        await loadVolunteerData(user.uid, user.email || '');
        alert('Service removed.');
        return;
      }

      const remainingAssignments = assignments.filter((item) => item.id !== assignment.id);
      const hasOtherServiceAssignment = remainingAssignments.some((item) => item.serviceId === assignment.serviceId);
      const hasOtherEventAssignment = remainingAssignments.some((item) => item.eventId === assignment.eventId);

      await Promise.all([
        deleteDoc(doc(db, 'serviceAssignments', assignment.id)),
        updateDoc(doc(db, 'volunteers', profile.uid), {
          ...(hasOtherServiceAssignment ? {} : { assignedServices: arrayRemove(assignment.serviceId) }),
          ...(hasOtherEventAssignment ? {} : { assignedEvents: arrayRemove(assignment.eventId) }),
          updatedAt: Timestamp.now(),
        }),
      ]);
      await loadVolunteerData(user.uid, user.email || '');
      alert('Service removed.');
    } catch (error) {
      alert(getErrorMessage(error, 'Unable to remove service'));
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

  const assignedSlotIds = useMemo(
    () => new Set(assignments.map((assignment) => `${assignment.serviceId}_${assignment.slotKey || ''}`)),
    [assignments]
  );
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.eventDateTime).getTime() - new Date(b.eventDateTime).getTime()
  );
  const filteredEvents = sortedEvents.filter((event) => {
    const query = eventSearch.trim().toLowerCase();
    if (!query) return true;
    return event.topic.toLowerCase().includes(query);
  });
  const filteredServices = services.filter((service) => {
    const query = serviceSearch.trim().toLowerCase();
    if (!query) return true;
    const event = events.find((item) => item.id === service.eventId);
    return service.name.toLowerCase().includes(query) || event?.topic.toLowerCase().includes(query);
  });
  if (loading) {
    return <div className="loading">Loading...</div>;
  }

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
        {loadError && <div className="error-message">{loadError}</div>}

        <section className="profile-section">
          <h2>Your Information</h2>
          <form className="profile-form" onSubmit={handleUpdateProfile}>
            <input
              type="text"
              placeholder="First name"
              value={profileForm.firstName}
              onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
              required
            />
            <input
              type="text"
              placeholder="Last name"
              value={profileForm.lastName}
              onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
              required
            />
            <input
              type="tel"
              placeholder="Phone Number"
              value={profileForm.phoneNumber}
              onChange={(e) => setProfileForm({ ...profileForm, phoneNumber: e.target.value })}
              required
            />
            <button type="submit">Update</button>
          </form>
          {profile?.email && <p className="profile-email"><strong>Email:</strong> {profile.email}</p>}
        </section>

        <section className="events-section">
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
              {filteredEvents.map((event) => {
                const eventServices = services.filter((service) => service.eventId === event.id);

                return (
                  <div key={event.id} className="event-card">
                    <div className="event-header">
                      <h3>{event.topic}</h3>
                      <span className={`status ${event.status}`}>{event.status}</span>
                    </div>

                    {event.description && <p className="event-description">{event.description}</p>}

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
                    </div>
                    <p><strong>Services:</strong> {eventServices.length}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="services-section">
          <h2>Services</h2>
          <div className="list-toolbar">
            <input
              type="search"
              placeholder="Search services..."
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
            />
            <span>Select a service to volunteer.</span>
          </div>

          {filteredServices.length === 0 ? (
            <div className="empty-state">
              <p>No services are available yet.</p>
            </div>
          ) : (
            <div className="services-list">
              {filteredServices.map((service) => {
                const event = events.find((item) => item.id === service.eventId);
                const slots = buildServiceSlots(service);
                return (
                  <div key={service.id} className="service-card">
                    <h3 className="service-name">{service.name}</h3>
                    <p><strong>Event:</strong> {event?.topic || 'Unlinked event'}</p>
                    {event && <p><strong>Date:</strong> {formatDate(event.eventDateTime)}</p>}
                    <p className="service-time">
                      {formatTime(service.startTime)} - {formatTime(service.endTime)}
                    </p>
                    {service.description && <p>{service.description}</p>}
                    <div className="slot-list">
                      {slots.map((slot) => {
                        const assignment = assignments.find(
                          (item) => item.serviceId === service.id && (item.slotKey || '') === slot.key
                        );
                        const assigned = Boolean(assignment) || assignedSlotIds.has(`${service.id}_${slot.key}`);

                        return (
                          <div key={slot.key} className="slot-row">
                            <span className="slot-label">{slot.label}</span>
                            <button
                              type="button"
                              className={assigned ? 'remove-slot-btn' : undefined}
                              onClick={() => {
                                if (assignment) {
                                  handleRemoveService(assignment);
                                  return;
                                }
                                handleAssignService(service.eventId, service.id, slot);
                              }}
                            >
                              {assigned ? 'Remove' : 'Select'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
};

export default VolunteerDashboard;
