class AuthManager {
  constructor() {
    this.sessionKey = "volunteers.session";
  }

  getSession() {
    const stored = localStorage.getItem(this.sessionKey);
    return stored ? JSON.parse(stored) : null;
  }

  setLocalSession(email, name) {
    const isAdmin = email.toLowerCase().includes("admin");
    const session = {
      uid: isAdmin ? "admin-demo" : "volunteer-demo",
      email,
      displayName: name || (isAdmin ? "Demo Admin" : "Demo Volunteer"),
      isAdmin,
      local: true,
    };
    localStorage.setItem(this.sessionKey, JSON.stringify(session));
    return session;
  }

  async login(email, password) {
    if (!isFirebaseConfigured) {
      return this.setLocalSession(email);
    }

    const credential = await auth.signInWithEmailAndPassword(email, password);
    return this.buildFirebaseSession(credential.user);
  }

  async signup({ name, email, password, phoneNumber }) {
    if (!isFirebaseConfigured) {
      const session = this.setLocalSession(email, name);
      window.storageManager.ensureVolunteer(session, phoneNumber);
      return session;
    }

    const credential = await auth.createUserWithEmailAndPassword(email, password);
    await credential.user.updateProfile({ displayName: name });
    await db.collection("volunteers").doc(credential.user.uid).set({
      name,
      email,
      phoneNumber,
      address: "",
      joinedDate: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return this.buildFirebaseSession(credential.user);
  }

  async buildFirebaseSession(user) {
    const adminDoc = await db.collection("admins").doc(user.uid).get();
    const session = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email,
      isAdmin: adminDoc.exists && adminDoc.data().isAdmin === true,
      local: false,
    };
    localStorage.setItem(this.sessionKey, JSON.stringify(session));
    return session;
  }

  listen(callback) {
    if (!isFirebaseConfigured) {
      callback(this.getSession());
      return () => {};
    }

    return auth.onAuthStateChanged(async (user) => {
      callback(user ? await this.buildFirebaseSession(user) : null);
    });
  }

  async logout() {
    localStorage.removeItem(this.sessionKey);
    if (isFirebaseConfigured) {
      await auth.signOut();
    }
  }
}
