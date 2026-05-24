class StorageManager {
  constructor() {
    this.eventsKey = "volunteers.events";
    this.volunteersKey = "volunteers.volunteers";
    this.seedLocalData();
  }

  seedLocalData() {
    if (!localStorage.getItem(this.eventsKey)) {
      localStorage.setItem(this.eventsKey, JSON.stringify(window.LOCAL_APP_DATA.events));
    }
    if (!localStorage.getItem(this.volunteersKey)) {
      localStorage.setItem(this.volunteersKey, JSON.stringify(window.LOCAL_APP_DATA.volunteers));
    }
  }

  parseDates(item) {
    return {
      ...item,
      eventDateTime: item.eventDateTime ? new Date(item.eventDateTime) : undefined,
      joinedDate: item.joinedDate ? new Date(item.joinedDate) : undefined,
    };
  }

  readLocal(key) {
    return JSON.parse(localStorage.getItem(key) || "[]").map((item) => this.parseDates(item));
  }

  writeLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async getEvents(session) {
    if (!isFirebaseConfigured) {
      const events = this.readLocal(this.eventsKey);
      return session?.isAdmin
        ? events
        : events.filter((event) => event.assignedVolunteers.includes(session?.uid));
    }

    let snapshot;
    if (session?.isAdmin) {
      snapshot = await db.collection("serviceEvents").get();
    } else {
      snapshot = await db
        .collection("serviceEvents")
        .where("assignedVolunteers", "array-contains", session.uid)
        .get();
    }

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      eventDateTime: doc.data().eventDateTime?.toDate?.() || new Date(),
    }));
  }

  async getVolunteers() {
    if (!isFirebaseConfigured) {
      return this.readLocal(this.volunteersKey);
    }

    const snapshot = await db.collection("volunteers").get();
    return snapshot.docs.map((doc) => ({ id: doc.id, uid: doc.id, ...doc.data() }));
  }

  async createEvent(event) {
    if (!isFirebaseConfigured) {
      const events = this.readLocal(this.eventsKey);
      events.push({ ...event, id: `event-${Date.now()}` });
      this.writeLocal(this.eventsKey, events);
      return;
    }

    await db.collection("serviceEvents").add({
      ...event,
      eventDateTime: firebase.firestore.Timestamp.fromDate(event.eventDateTime),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  async deleteEvent(eventId) {
    if (!isFirebaseConfigured) {
      this.writeLocal(
        this.eventsKey,
        this.readLocal(this.eventsKey).filter((event) => event.id !== eventId)
      );
      return;
    }

    await functions.httpsCallable("deleteServiceEvent")({ eventId });
  }

  async updateEventStatus(eventId, status) {
    if (!isFirebaseConfigured) {
      this.writeLocal(
        this.eventsKey,
        this.readLocal(this.eventsKey).map((event) =>
          event.id === eventId ? { ...event, status } : event
        )
      );
      return;
    }

    await db.collection("serviceEvents").doc(eventId).update({
      status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  async createVolunteer(volunteer) {
    if (!isFirebaseConfigured) {
      const volunteers = this.readLocal(this.volunteersKey);
      volunteers.push({
        ...volunteer,
        id: `volunteer-${Date.now()}`,
        uid: `volunteer-${Date.now()}`,
        joinedDate: new Date(),
      });
      this.writeLocal(this.volunteersKey, volunteers);
      return;
    }

    await functions.httpsCallable("createVolunteer")(volunteer);
  }

  async deleteVolunteer(volunteerId) {
    if (!isFirebaseConfigured) {
      this.writeLocal(
        this.volunteersKey,
        this.readLocal(this.volunteersKey).filter((volunteer) => volunteer.id !== volunteerId)
      );
      this.writeLocal(
        this.eventsKey,
        this.readLocal(this.eventsKey).map((event) => ({
          ...event,
          assignedVolunteers: event.assignedVolunteers.filter((id) => id !== volunteerId),
        }))
      );
      return;
    }

    await functions.httpsCallable("deleteVolunteer")({ volunteerId });
  }

  async assignVolunteer(eventId, volunteerId) {
    if (!isFirebaseConfigured) {
      this.writeLocal(
        this.eventsKey,
        this.readLocal(this.eventsKey).map((event) =>
          event.id === eventId && !event.assignedVolunteers.includes(volunteerId)
            ? { ...event, assignedVolunteers: [...event.assignedVolunteers, volunteerId] }
            : event
        )
      );
      return;
    }

    const eventRef = db.collection("serviceEvents").doc(eventId);
    await eventRef.update({
      assignedVolunteers: firebase.firestore.FieldValue.arrayUnion(volunteerId),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  async updateVolunteerProfile(uid, profile) {
    if (!isFirebaseConfigured) {
      this.writeLocal(
        this.volunteersKey,
        this.readLocal(this.volunteersKey).map((volunteer) =>
          volunteer.uid === uid ? { ...volunteer, ...profile } : volunteer
        )
      );
      return;
    }

    await db.collection("volunteers").doc(uid).update({
      ...profile,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  ensureVolunteer(session, phoneNumber) {
    const volunteers = this.readLocal(this.volunteersKey);
    if (volunteers.some((volunteer) => volunteer.uid === session.uid)) return;
    volunteers.push({
      id: session.uid,
      uid: session.uid,
      name: session.displayName,
      email: session.email,
      phoneNumber,
      address: "",
      joinedDate: new Date(),
    });
    this.writeLocal(this.volunteersKey, volunteers);
  }
}
