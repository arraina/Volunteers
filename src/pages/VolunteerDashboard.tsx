import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, onAuthStateChanged, User, updateProfile } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { collection, query, where, getDocs, updateDoc, doc, getDoc } from 'firebase/firestore';
import { isUserAdmin, VolunteerProfile, ServiceEvent, formatDate } from '../helpers/types';
import './VolunteerDashboard.css';

export const VolunteerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [assignedEvents, setAssignedEvents] = useState<ServiceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    name: '',
    phoneNumber: '',
    address: '',
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check if user is admin - redirect if they are
        const admin = await isUserAdmin(currentUser);
        if (admin) {
          navigate('/admin');
          return;
        }

        await loadVolunteerData(currentUser.uid);
      } else {
        navigate('/login');
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [navigate]);

  const loadVolunteerData = async (userId: string) => {
    try {
      // Load volunteer profile
      const volunteerDoc = await getDoc(doc(db, 'volunteers', userId));
      if (volunteerDoc.exists()) {
        const data = volunteerDoc.data();
        const volunteerProfile: VolunteerProfile = {
          uid: volunteerDoc.id,
          name: data.name,
          email: data.email,
          phoneNumber: data.phoneNumber,
          address: data.address || '',
          availableHours: data.availableHours || 0,
          joinedDate: data.joinedDate?.toDate?.() || new Date(),
        };
        setProfile(volunteerProfile);
        setProfileData({
          name: volunteerProfile.name,
          phoneNumber: volunteerProfile.phoneNumber,
          address: volunteerProfile.address,
        });
      }

      // Load assigned events
      const eventsQuery = query(
        collection(db, 'serviceEvents'),
        where('assignedVolunteers', 'array-contains', userId)
      );
      const eventsSnapshot = await getDocs(eventsQuery);
      const eventsData = eventsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        eventDateTime: doc.data().eventDateTime?.toDate?.() || new Date(),
      } as ServiceEvent));
      setAssignedEvents(eventsData);
    } catch (error) {
      console.error('Error loading volunteer data:', error);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const volunteerRef = doc(db, 'volunteers', user.uid);
      await updateDoc(volunteerRef, {
        name: profileData.name,
        phoneNumber: profileData.phoneNumber,
        address: profileData.address,
      });

      // Update Firebase Auth display name
      if (profileData.name !== user.displayName) {
        await updateProfile(user, { displayName: profileData.name });
      }

      setEditingProfile(false);
      alert('Profile updated successfully!');
      
      // Reload profile
      if (user) {
        await loadVolunteerData(user.uid);
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

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
        {/* Profile Section */}
        <div className="profile-section">
          <div className="profile-card">
            <h2>My Profile</h2>
            
            {!editingProfile ? (
              <div className="profile-view">
                <div className="profile-item">
                  <label>Name</label>
                  <p>{profile?.name}</p>
                </div>
                <div className="profile-item">
                  <label>Email</label>
                  <p>{profile?.email}</p>
                </div>
                <div className="profile-item">
                  <label>Phone Number</label>
                  <p>{profile?.phoneNumber}</p>
                </div>
                <div className="profile-item">
                  <label>Address</label>
                  <p>{profile?.address || 'Not provided'}</p>
                </div>
                <div className="profile-item">
                  <label>Member Since</label>
                  <p>{formatDate(profile?.joinedDate)}</p>
                </div>
                <button onClick={() => setEditingProfile(true)} className="edit-btn">
                  Edit Profile
                </button>
              </div>
            ) : (
              <form onSubmit={handleUpdateProfile} className="profile-form">
                <div className="form-group">
                  <label>Name</label>
                  <input
                    type="text"
                    value={profileData.name}
                    onChange={(e) => setProfileData({...profileData, name: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    value={profileData.phoneNumber}
                    onChange={(e) => setProfileData({...profileData, phoneNumber: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <input
                    type="text"
                    value={profileData.address}
                    onChange={(e) => setProfileData({...profileData, address: e.target.value})}
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="save-btn">Save Changes</button>
                  <button
                    type="button"
                    onClick={() => setEditingProfile(false)}
                    className="cancel-btn"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Events Section */}
        <div className="events-section">
          <h2>My Assigned Events ({assignedEvents.length})</h2>
          
          {assignedEvents.length === 0 ? (
            <div className="empty-state">
              <p>You have no assigned events yet. Check back soon!</p>
            </div>
          ) : (
            <div className="events-list">
              {assignedEvents.map((event) => (
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

        {/* Info Box */}
        <div className="info-box">
          <h3>📱 SMS Reminders</h3>
          <p>
            Event administrators will send you SMS reminders before your scheduled events.
            Make sure your phone number is correct so you don't miss any updates!
          </p>
        </div>
      </div>
    </div>
  );
};

export default VolunteerDashboard;
