import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
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
import './AdminDashboard.css';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [events, setEvents] = useState<ServiceEvent[]>([]);
  const [services, setServices] = useState<EventService[]>([]);
  const [assignments, setAssignments] = useState<ServiceAssignment[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [eventSearch, setEventSearch] = useState('');
  const [volunteerSearch, setVolunteerSearch] = useState('');

  const [newEvent, setNewEvent] = useState({
    topic: '',
    description: '',
    eventDateTime: '',
    location: '',
  });
  const [newVolunteer, setNewVolunteer] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    email: '',
  });
  const [newService, setNewService] = useState({
    eventId: '',
    name: '',
    description: '',
    startTime: '',
    endTime: '',
    intervalMinutes: '30',
    capacity: '',
  });

  useEffect(() => {
    if (!isFirebaseConfigured) {
      navigate('/login');
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        navigate('/login');
        setLoading(false);
        return;
      }

      if (!(await isUserAdmin(currentUser))) {
        navigate('/dashboard');
        setLoading(false);
        return;
      }

      setUser(currentUser);
      await loadData();
      setLoading(false);
    });

    return unsubscribe;
  }, [navigate]);

  const loadData = async () => {
    try {
      setLoadError('');

      const [eventsSnapshot, servicesSnapshot, assignmentsSnapshot, volunteersSnapshot] = await Promise.all([
        getDocs(collection(db, 'serviceEvents')),
        getDocs(collection(db, 'services')),
        getDocs(collection(db, 'serviceAssignments')),
        getDocs(collection(db, 'volunteers')),
      ]);

      setEvents(eventsSnapshot.docs.map((eventDoc) => ({
        id: eventDoc.id,
        ...eventDoc.data(),
        eventDateTime: eventDoc.data().eventDateTime?.toDate?.() || new Date(),
      } as ServiceEvent)));

      setServices(servicesSnapshot.docs.map((serviceDoc) => ({
        id: serviceDoc.id,
        ...serviceDoc.data(),
        createdAt: serviceDoc.data().createdAt?.toDate?.() || new Date(),
        updatedAt: serviceDoc.data().updatedAt?.toDate?.() || new Date(),
      } as EventService)));

      setAssignments(assignmentsSnapshot.docs.map((assignmentDoc) => ({
        id: assignmentDoc.id,
        ...assignmentDoc.data(),
        createdAt: assignmentDoc.data().createdAt?.toDate?.() || new Date(),
      } as ServiceAssignment)));

      setVolunteers(volunteersSnapshot.docs.map((volunteerDoc) => {
        const data = volunteerDoc.data();
        return {
          uid: volunteerDoc.id,
          ...data,
          joinedDate: data.joinedDate?.toDate?.() || new Date(),
        } as VolunteerProfile;
      }));
    } catch (error) {
      console.error('Error loading admin data:', error);
      setLoadError(getErrorMessage(error, 'Unable to load admin data.'));
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const topic = newEvent.topic.trim();
      if (!topic || !newEvent.eventDateTime) {
        throw new Error('Event name and date are required.');
      }

      await addDoc(collection(db, 'serviceEvents'), {
        topic,
        description: newEvent.description.trim(),
        eventDateTime: Timestamp.fromDate(new Date(newEvent.eventDateTime)),
        location: newEvent.location.trim(),
        assignedVolunteers: [],
        status: 'scheduled',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      setNewEvent({ topic: '', description: '', eventDateTime: '', location: '' });
      await loadData();
      alert(`Event "${topic}" has been saved.`);
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to create event.'));
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const firstName = newVolunteer.firstName.trim();
      const lastName = newVolunteer.lastName.trim();
      const phoneNumber = newVolunteer.phoneNumber.trim();
      const email = newVolunteer.email.trim().toLowerCase();

      if (!firstName || !lastName || !phoneNumber || !email) {
        throw new Error('First name, last name, phone, and email are required.');
      }

      await addDoc(collection(db, 'volunteers'), {
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        phoneNumber,
        email,
        address: '',
        assignedEvents: [],
        assignedServices: [],
        joinedDate: Timestamp.now(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      setNewVolunteer({ firstName: '', lastName: '', phoneNumber: '', email: '' });
      await loadData();
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to add user.'));
    }
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const eventId = newService.eventId;
      const name = newService.name.trim();
      if (!eventId || !name || !newService.startTime || !newService.endTime) {
        throw new Error('Choose an event, enter a service name, and set start/end times.');
      }

      if (newService.endTime <= newService.startTime) {
        throw new Error('End time must be after start time.');
      }

      const capacity = Number(newService.capacity);
      const intervalMinutes = Number(newService.intervalMinutes);
      if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
        throw new Error('Choose a valid service interval.');
      }

      await addDoc(collection(db, 'services'), {
        eventId,
        name,
        description: newService.description.trim(),
        startTime: newService.startTime,
        endTime: newService.endTime,
        intervalMinutes,
        capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      setNewService({ eventId: '', name: '', description: '', startTime: '', endTime: '', intervalMinutes: '30', capacity: '' });
      await loadData();
      alert(`Service "${name}" has been saved.`);
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to create service.'));
    }
  };

  const handleDeleteEvent = async (eventId: string, topic: string) => {
    if (!window.confirm(`Remove event "${topic}" and its services?`)) return;

    try {
      const [eventServicesSnapshot, eventAssignmentsSnapshot, affectedVolunteersSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'services'), where('eventId', '==', eventId))),
        getDocs(query(collection(db, 'serviceAssignments'), where('eventId', '==', eventId))),
        getDocs(query(collection(db, 'volunteers'), where('assignedEvents', 'array-contains', eventId))),
      ]);
      const serviceIds = eventServicesSnapshot.docs.map((serviceDoc) => serviceDoc.id);

      await Promise.all([
        deleteDoc(doc(db, 'serviceEvents', eventId)),
        ...eventServicesSnapshot.docs.map((serviceDoc) => deleteDoc(serviceDoc.ref)),
        ...eventAssignmentsSnapshot.docs.map((assignmentDoc) => deleteDoc(assignmentDoc.ref)),
        ...affectedVolunteersSnapshot.docs.map((volunteerDoc) =>
          updateDoc(volunteerDoc.ref, {
            assignedEvents: arrayRemove(eventId),
            ...(serviceIds.length > 0 ? { assignedServices: arrayRemove(...serviceIds) } : {}),
            updatedAt: Timestamp.now(),
          })
        ),
      ]);

      await loadData();
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to remove event.'));
    }
  };

  const handleDeleteUser = async (volunteerId: string, name: string) => {
    if (!window.confirm(`Remove user "${name}"?`)) return;

    try {
      const [userAssignmentsSnapshot, affectedEventsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'serviceAssignments'), where('volunteerId', '==', volunteerId))),
        getDocs(query(collection(db, 'serviceEvents'), where('assignedVolunteers', 'array-contains', volunteerId))),
      ]);

      await Promise.all([
        deleteDoc(doc(db, 'volunteers', volunteerId)),
        ...userAssignmentsSnapshot.docs.map((assignmentDoc) => deleteDoc(assignmentDoc.ref)),
        ...affectedEventsSnapshot.docs.map((eventDoc) =>
          updateDoc(eventDoc.ref, {
            assignedVolunteers: arrayRemove(volunteerId),
            updatedAt: Timestamp.now(),
          })
        ),
      ]);

      await loadData();
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to remove user.'));
    }
  };

  const handleDeleteService = async (serviceId: string, serviceName: string, eventId: string) => {
    if (!window.confirm(`Remove service "${serviceName}" and its assignments?`)) return;

    try {
      const [serviceAssignmentsSnapshot, eventAssignmentsSnapshot, affectedVolunteersSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'serviceAssignments'), where('serviceId', '==', serviceId))),
        getDocs(query(collection(db, 'serviceAssignments'), where('eventId', '==', eventId))),
        getDocs(query(collection(db, 'volunteers'), where('assignedServices', 'array-contains', serviceId))),
      ]);
      const assignmentVolunteerIds = new Set(
        serviceAssignmentsSnapshot.docs.map((assignmentDoc) => assignmentDoc.data().volunteerId).filter(Boolean)
      );
      const volunteersToRemoveFromEvent = new Set(
        Array.from(assignmentVolunteerIds).filter((volunteerId) =>
          !eventAssignmentsSnapshot.docs.some((assignmentDoc) => {
            const assignment = assignmentDoc.data();
            return assignment.serviceId !== serviceId && assignment.volunteerId === volunteerId;
          })
        )
      );

      await Promise.all([
        deleteDoc(doc(db, 'services', serviceId)),
        ...serviceAssignmentsSnapshot.docs.map((assignmentDoc) => deleteDoc(assignmentDoc.ref)),
        ...affectedVolunteersSnapshot.docs.map((volunteerDoc) =>
          updateDoc(volunteerDoc.ref, {
            assignedServices: arrayRemove(serviceId),
            updatedAt: Timestamp.now(),
          })
        ),
        ...(volunteersToRemoveFromEvent.size > 0
          ? [
              updateDoc(doc(db, 'serviceEvents', eventId), {
                assignedVolunteers: arrayRemove(...Array.from(volunteersToRemoveFromEvent)),
                updatedAt: Timestamp.now(),
              }),
            ]
          : []),
      ]);

      await loadData();
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to remove service.'));
    }
  };

  const handleAssignVolunteerToService = async (
    eventId: string,
    serviceId: string,
    slot: ServiceTimeSlot,
    volunteerId: string
  ) => {
    const volunteer = volunteers.find((item) => item.uid === volunteerId);
    if (!volunteer) return;

    try {
      const assignmentId = `${eventId}_${serviceId}_${slot.key}_${volunteerId}`;
      await setDoc(doc(db, 'serviceAssignments', assignmentId), {
        eventId,
        serviceId,
        slotKey: slot.key,
        slotStartTime: slot.startTime,
        slotEndTime: slot.endTime,
        volunteerId,
        volunteerName: volunteer.name,
        volunteerEmail: volunteer.email,
        createdAt: Timestamp.now(),
      });
      await updateDoc(doc(db, 'volunteers', volunteerId), {
        assignedEvents: arrayUnion(eventId),
        assignedServices: arrayUnion(serviceId),
        updatedAt: Timestamp.now(),
      });
      await updateDoc(doc(db, 'serviceEvents', eventId), {
        assignedVolunteers: arrayUnion(volunteerId),
        updatedAt: Timestamp.now(),
      });
      await loadData();
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to assign volunteer.'));
    }
  };

  const handleRemoveVolunteerFromService = async (assignment: ServiceAssignment) => {
    if (!window.confirm(`Remove ${assignment.volunteerName} from this service time?`)) return;

    try {
      const volunteerAssignmentsSnapshot = await getDocs(
        query(collection(db, 'serviceAssignments'), where('volunteerId', '==', assignment.volunteerId))
      );
      const hasOtherServiceAssignment = volunteerAssignmentsSnapshot.docs.some((assignmentDoc) => {
        const item = assignmentDoc.data();
        return assignmentDoc.id !== assignment.id && item.serviceId === assignment.serviceId;
      });
      const hasOtherEventAssignment = volunteerAssignmentsSnapshot.docs.some((assignmentDoc) => {
        const item = assignmentDoc.data();
        return assignmentDoc.id !== assignment.id && item.eventId === assignment.eventId;
      });

      await Promise.all([
        deleteDoc(doc(db, 'serviceAssignments', assignment.id)),
        updateDoc(doc(db, 'volunteers', assignment.volunteerId), {
          ...(hasOtherServiceAssignment ? {} : { assignedServices: arrayRemove(assignment.serviceId) }),
          ...(hasOtherEventAssignment ? {} : { assignedEvents: arrayRemove(assignment.eventId) }),
          updatedAt: Timestamp.now(),
        }),
        ...(hasOtherEventAssignment
          ? []
          : [
              updateDoc(doc(db, 'serviceEvents', assignment.eventId), {
                assignedVolunteers: arrayRemove(assignment.volunteerId),
                updatedAt: Timestamp.now(),
              }),
            ]),
      ]);

      await loadData();
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to remove volunteer from service.'));
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const filteredEvents = [...events]
    .sort((a, b) => new Date(a.eventDateTime).getTime() - new Date(b.eventDateTime).getTime())
    .filter((event) => {
      const query = eventSearch.trim().toLowerCase();
      return !query || event.topic.toLowerCase().includes(query);
    });

  const filteredVolunteers = volunteers.filter((volunteer) => {
    const query = volunteerSearch.trim().toLowerCase();
    return !query || volunteer.name.toLowerCase().includes(query) || volunteer.email.toLowerCase().includes(query);
  });

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="admin-dashboard">
      <header className="dashboard-header">
        <div>
          <h1>ISKCON TOWACO VOLUNTEER MANAGEMENT</h1>
          <p>Admin</p>
        </div>
        <div className="header-actions">
          <span className="user-info">{user?.email}</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </header>

      <div className="dashboard-content">
        {loadError && <div className="error-message">{loadError}</div>}

        <section className="admin-columns">
          <div className="form-section">
            <h2>Create Event</h2>
            <form onSubmit={handleCreateEvent}>
              <input
                type="text"
                placeholder="Event name"
                value={newEvent.topic}
                onChange={(e) => setNewEvent({ ...newEvent, topic: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="Description"
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
              />
              <input
                type="datetime-local"
                value={newEvent.eventDateTime}
                onChange={(e) => setNewEvent({ ...newEvent, eventDateTime: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="Location"
                value={newEvent.location}
                onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
              />
              <button type="submit">Create Event</button>
            </form>
          </div>

          <div className="form-section">
            <h2>Create Service</h2>
            <form onSubmit={handleCreateService}>
              <select
                value={newService.eventId}
                onChange={(e) => setNewService({ ...newService, eventId: e.target.value })}
                required
              >
                <option value="">Choose event</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>{event.topic}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Service name"
                value={newService.name}
                onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="Description"
                value={newService.description}
                onChange={(e) => setNewService({ ...newService, description: e.target.value })}
              />
              <label>
                Start time
                <input
                  type="time"
                  value={newService.startTime}
                  onChange={(e) => setNewService({ ...newService, startTime: e.target.value })}
                  required
                />
              </label>
              <label>
                End time
                <input
                  type="time"
                  value={newService.endTime}
                  onChange={(e) => setNewService({ ...newService, endTime: e.target.value })}
                  required
                />
              </label>
              <label>
                Interval
                <select
                  value={newService.intervalMinutes}
                  onChange={(e) => setNewService({ ...newService, intervalMinutes: e.target.value })}
                  required
                >
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </label>
              <input
                type="number"
                min="1"
                placeholder="Capacity"
                value={newService.capacity}
                onChange={(e) => setNewService({ ...newService, capacity: e.target.value })}
              />
              <button type="submit">Create Service</button>
            </form>
          </div>

          <div className="form-section">
            <h2>Add User</h2>
            <form onSubmit={handleCreateUser}>
              <input
                type="text"
                placeholder="First name"
                value={newVolunteer.firstName}
                onChange={(e) => setNewVolunteer({ ...newVolunteer, firstName: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="Last name"
                value={newVolunteer.lastName}
                onChange={(e) => setNewVolunteer({ ...newVolunteer, lastName: e.target.value })}
                required
              />
              <input
                type="tel"
                placeholder="Phone number"
                value={newVolunteer.phoneNumber}
                onChange={(e) => setNewVolunteer({ ...newVolunteer, phoneNumber: e.target.value })}
                required
              />
              <input
                type="email"
                placeholder="Email"
                value={newVolunteer.email}
                onChange={(e) => setNewVolunteer({ ...newVolunteer, email: e.target.value })}
                required
              />
              <button type="submit">Add User</button>
            </form>
          </div>
        </section>

        <section className="records-section">
          <h2>Events</h2>
          <div className="list-toolbar">
            <input
              type="search"
              placeholder="Search events..."
              value={eventSearch}
              onChange={(e) => setEventSearch(e.target.value)}
            />
          </div>
          <div className="events-list">
            {filteredEvents.map((event) => {
              const eventServices = services.filter((service) => service.eventId === event.id);

              return (
                <div key={event.id} className="event-card">
                  <div className="card-title-row">
                    <h3>{event.topic}</h3>
                    <button
                      type="button"
                      className="danger-btn"
                      onClick={() => handleDeleteEvent(event.id, event.topic)}
                    >
                      Remove Event
                    </button>
                  </div>
                  <p>{event.description || 'No description.'}</p>
                  <p><strong>Date:</strong> {formatDate(event.eventDateTime)}</p>
                  <p><strong>Location:</strong> {event.location || 'N/A'}</p>
                  <div className="service-list">
                    <strong>Services</strong>
                    {eventServices.length === 0 ? (
                      <p>No services yet.</p>
                    ) : (
                      eventServices.map((service) => {
                        const slots = buildServiceSlots(service);

                        return (
                          <div key={service.id} className="service-row">
                            <div className="service-title-row">
                              <div>
                                <span className="service-name">{service.name}</span>
                                <small className="service-time">
                                  {formatTime(service.startTime)} - {formatTime(service.endTime)}
                                </small>
                              </div>
                              <button
                                type="button"
                                className="danger-btn service-remove-btn"
                                onClick={() => handleDeleteService(service.id, service.name, event.id)}
                              >
                                Remove Service
                              </button>
                            </div>
                            <div className="slot-list">
                              {slots.map((slot) => {
                                const slotAssignments = assignments.filter(
                                  (assignment) =>
                                    assignment.serviceId === service.id &&
                                    (assignment.slotKey || '') === slot.key
                                );
                                const assignedVolunteerIds = new Set(
                                  slotAssignments.map((assignment) => assignment.volunteerId)
                                );

                                return (
                                  <div key={slot.key} className="slot-row">
                                    <div>
                                      <span className="slot-label">{slot.label}</span>
                                      <small>{slotAssignments.length}{service.capacity ? `/${service.capacity}` : ''} assigned</small>
                                      {slotAssignments.length > 0 && (
                                        <div className="assigned-volunteers">
                                          {slotAssignments.map((assignment) => (
                                            <div key={assignment.id} className="assigned-volunteer-row">
                                              <span>{assignment.volunteerName}</span>
                                              <button
                                                type="button"
                                                className="danger-btn remove-assignment-btn"
                                                onClick={() => handleRemoveVolunteerFromService(assignment)}
                                              >
                                                Remove
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <select
                                      defaultValue=""
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          handleAssignVolunteerToService(event.id, service.id, slot, e.target.value);
                                          e.target.value = '';
                                        }
                                      }}
                                      disabled={Boolean(service.capacity && slotAssignments.length >= service.capacity)}
                                    >
                                      <option value="">Assign user</option>
                                      {volunteers
                                        .filter((volunteer) => !assignedVolunteerIds.has(volunteer.uid))
                                        .map((volunteer) => (
                                          <option key={volunteer.uid} value={volunteer.uid}>
                                            {volunteer.name}
                                          </option>
                                        ))}
                                    </select>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="records-section">
          <h2>Users</h2>
          <div className="list-toolbar">
            <input
              type="search"
              placeholder="Search users..."
              value={volunteerSearch}
              onChange={(e) => setVolunteerSearch(e.target.value)}
            />
          </div>
          <div className="volunteers-list">
            {filteredVolunteers.map((volunteer) => {
              const assignedNames = assignments
                .filter((assignment) => assignment.volunteerId === volunteer.uid)
                .map((assignment) => {
                  const service = services.find((item) => item.id === assignment.serviceId);
                  const slotLabel = assignment.slotStartTime && assignment.slotEndTime
                    ? ` (${formatTime(assignment.slotStartTime)} - ${formatTime(assignment.slotEndTime)})`
                    : '';
                  return service ? `${service.name}${slotLabel}` : '';
                })
                .filter(Boolean);

              return (
                <div key={volunteer.uid} className="volunteer-card">
                  <div className="card-title-row">
                    <h3>{volunteer.name}</h3>
                    <button
                      type="button"
                      className="danger-btn"
                      onClick={() => handleDeleteUser(volunteer.uid, volunteer.name)}
                    >
                      Remove
                    </button>
                  </div>
                  <p><strong>Email:</strong> {volunteer.email}</p>
                  <p><strong>Phone:</strong> {volunteer.phoneNumber || 'N/A'}</p>
                  <p><strong>Services:</strong> {assignedNames.length ? assignedNames.join(', ') : 'None'}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminDashboard;
