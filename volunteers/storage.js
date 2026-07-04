class StorageManager {
  constructor() {
    this.eventsKey = "volunteers.events";
    this.volunteersKey = "volunteers.volunteers";
    this.reminderRulesKey = "volunteers.reminderRules";
    this.useLocalServerDb =
      useDemoMode && ["localhost", "127.0.0.1"].includes(window.location.hostname);
    this.seedLocalData();
  }

  seedLocalData() {
    if (!localStorage.getItem(this.eventsKey)) {
      localStorage.setItem(this.eventsKey, JSON.stringify(window.LOCAL_APP_DATA.events));
    }
    if (!localStorage.getItem(this.volunteersKey)) {
      localStorage.setItem(this.volunteersKey, JSON.stringify(window.LOCAL_APP_DATA.volunteers));
    }
    if (!localStorage.getItem(this.reminderRulesKey)) {
      localStorage.setItem(this.reminderRulesKey, JSON.stringify([]));
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

  async api(path, options = {}) {
    const response = await fetch(path, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Local API request failed: ${response.status}`);
    }

    return response.json();
  }

  async getLocalEvents() {
    if (this.useLocalServerDb) {
      return (await this.api("/api/events")).map((item) => this.parseDates(item));
    }
    return this.readLocal(this.eventsKey);
  }

  async getLocalVolunteers() {
    if (this.useLocalServerDb) {
      return (await this.api("/api/volunteers")).map((item) => this.parseDates(item));
    }
    return this.readLocal(this.volunteersKey);
  }

  async getLocalReminderRules() {
    if (this.useLocalServerDb) {
      return (await this.api("/api/reminder-rules")).map((item) => this.parseDates(item));
    }
    return this.readLocal(this.reminderRulesKey);
  }

  async getEvents(session) {
    if (!isFirebaseConfigured || useDemoMode) {
      const events = await this.getLocalEvents();
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
    if (!isFirebaseConfigured || useDemoMode) {
      return this.getLocalVolunteers();
    }

    const snapshot = await db.collection("volunteers").get();
    return snapshot.docs.map((doc) => ({ id: doc.id, uid: doc.id, ...doc.data() }));
  }

  async getReminderRules() {
    if (!isFirebaseConfigured || useDemoMode) {
      return this.getLocalReminderRules();
    }

    const snapshot = await db.collection("reminderRules").get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || new Date(),
    }));
  }

  async createEvent(event) {
    if (!isFirebaseConfigured || useDemoMode) {
      if (this.useLocalServerDb) {
        await this.api("/api/events", {
          method: "POST",
          body: JSON.stringify(event),
        });
        return;
      }

      const events = this.readLocal(this.eventsKey);
      events.push({ ...event, id: `event-${Date.now()}` });
      this.writeLocal(this.eventsKey, events);
      return;
    }

    await db.collection("serviceEvents").add({
      ...event,
      assignedVolunteers: event.assignedVolunteers || [],
      eventDateTime: firebase.firestore.Timestamp.fromDate(event.eventDateTime),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  async deleteEvent(eventId) {
    if (!isFirebaseConfigured || useDemoMode) {
      if (this.useLocalServerDb) {
        await this.api(`/api/events/${eventId}`, { method: "DELETE" });
        return;
      }

      this.writeLocal(
        this.eventsKey,
        this.readLocal(this.eventsKey).filter((event) => event.id !== eventId)
      );
      return;
    }

    await functions.httpsCallable("deleteServiceEvent")({ eventId });
  }

  async updateEventStatus(eventId, status) {
    if (!isFirebaseConfigured || useDemoMode) {
      if (this.useLocalServerDb) {
        await this.api(`/api/events/${eventId}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        return;
      }

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
    if (!isFirebaseConfigured || useDemoMode) {
      if (this.useLocalServerDb) {
        await this.api("/api/volunteers", {
          method: "POST",
          body: JSON.stringify(volunteer),
        });
        return;
      }

      const volunteers = this.readLocal(this.volunteersKey);
      volunteers.push({
        ...volunteer,
        id: `volunteer-${Date.now()}`,
        uid: `volunteer-${Date.now()}`,
        assignedEvents: volunteer.assignedEvents || [],
        joinedDate: new Date(),
      });
      this.writeLocal(this.volunteersKey, volunteers);
      return;
    }

    await functions.httpsCallable("createVolunteer")(volunteer);
  }

  async createVolunteerProfile(volunteer) {
    if (!isFirebaseConfigured || useDemoMode) {
      return this.createVolunteer(volunteer);
    }

    await functions.httpsCallable("createVolunteerProfile")(volunteer);
  }

  async deleteVolunteer(volunteerId) {
    if (!isFirebaseConfigured || useDemoMode) {
      if (this.useLocalServerDb) {
        await this.api(`/api/volunteers/${volunteerId}`, { method: "DELETE" });
        return;
      }

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
    if (!isFirebaseConfigured || useDemoMode) {
      if (this.useLocalServerDb) {
        await this.api("/api/assignments", {
          method: "POST",
          body: JSON.stringify({ eventId, volunteerId }),
        });
        return;
      }

      const events = this.readLocal(this.eventsKey).map((event) =>
        event.id === eventId && !(event.assignedVolunteers || []).includes(volunteerId)
          ? { ...event, assignedVolunteers: [...(event.assignedVolunteers || []), volunteerId] }
          : event
      );
      const volunteers = this.readLocal(this.volunteersKey).map((volunteer) =>
        (volunteer.id === volunteerId || volunteer.uid === volunteerId) &&
        !(volunteer.assignedEvents || []).includes(eventId)
          ? { ...volunteer, assignedEvents: [...(volunteer.assignedEvents || []), eventId] }
          : volunteer
      );
      this.writeLocal(this.eventsKey, events);
      this.writeLocal(this.volunteersKey, volunteers);
      return;
    }

    await functions.httpsCallable("assignVolunteerToEvent")({ eventId, volunteerId });
  }

  async updateVolunteerProfile(uid, profile) {
    if (!isFirebaseConfigured || useDemoMode) {
      if (this.useLocalServerDb) {
        await this.api(`/api/volunteers/${uid}`, {
          method: "PATCH",
          body: JSON.stringify(profile),
        });
        return;
      }

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

  async createRemindersForEvent(rule) {
    if (!isFirebaseConfigured || useDemoMode) {
      if (this.useLocalServerDb) {
        await this.api("/api/reminder-rules", {
          method: "POST",
          body: JSON.stringify(rule),
        });
        return { remindersCreated: 0 };
      }

      const rules = this.readLocal(this.reminderRulesKey);
      const savedRule = {
        ...rule,
        id: `rule-${rule.eventId}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const existingIndex = rules.findIndex((item) => item.eventId === rule.eventId);
      if (existingIndex >= 0) {
        rules[existingIndex] = {
          ...rules[existingIndex],
          ...savedRule,
          createdAt: rules[existingIndex].createdAt,
        };
      } else {
        rules.push(savedRule);
      }
      this.writeLocal(this.reminderRulesKey, rules);
      return { remindersCreated: 0 };
    }

    const result = await functions.httpsCallable("createRemindersForEvent")(rule);
    return result.data;
  }

  ensureVolunteer(session, phoneNumber) {
    if (this.useLocalServerDb) {
      this.api("/api/volunteers", {
        method: "POST",
        body: JSON.stringify({
          id: session.uid,
          uid: session.uid,
          name: session.displayName,
          email: session.email,
          phoneNumber,
          address: "",
          joinedDate: new Date(),
        }),
      }).catch((error) => console.error("Unable to create local volunteer:", error));
      return;
    }

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
