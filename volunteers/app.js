class App {
  constructor() {
    this.auth = new AuthManager();
    this.storage = new StorageManager();
    window.storageManager = this.storage;
    this.ui = new UIManager(this);
    this.session = null;
  }

  init() {
    this.bindAuthForms();
    this.bindAdminForms();
    this.bindVolunteerForms();
    this.bindGlobalActions();
    this.auth.listen((session) => {
      this.session = session;
      this.route();
    });
  }

  async route() {
    this.ui.renderHeader(this.session);
    if (!this.session) {
      this.ui.showPage("authPage");
      return;
    }

    if (this.session.isAdmin) {
      this.ui.showPage("adminPage");
      await this.loadAdmin();
    } else {
      this.ui.showPage("volunteerPage");
      await this.loadVolunteer();
    }
  }

  bindAuthForms() {
    document.getElementById("loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const form = new FormData(event.target);
        this.session = await this.auth.login(form.get("email"), form.get("password"));
        this.route();
      } catch (error) {
        this.ui.message(error.message || "Unable to log in", "error");
      }
    });

    document.getElementById("signupForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const form = new FormData(event.target);
        this.session = await this.auth.signup({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          phoneNumber: form.get("phoneNumber"),
        });
        this.route();
      } catch (error) {
        this.ui.message(error.message || "Unable to sign up", "error");
      }
    });

    document.querySelectorAll("[data-auth-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-auth-tab]").forEach((tab) => tab.classList.remove("active"));
        document.querySelectorAll(".auth-form").forEach((form) => form.classList.remove("active"));
        button.classList.add("active");
        document.getElementById(button.dataset.authTab).classList.add("active");
      });
    });
  }

  bindAdminForms() {
    document.getElementById("eventForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      await this.storage.createEvent({
        topic: form.get("topic"),
        description: form.get("description"),
        eventDateTime: new Date(form.get("eventDateTime")),
        location: form.get("location"),
        assignedVolunteers: [],
        status: "scheduled",
      });
      event.target.reset();
      await this.loadAdmin();
      this.ui.message("Event created.", "success");
    });

    document.getElementById("volunteerForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      await this.storage.createVolunteer({
        name: form.get("name"),
        email: form.get("email"),
        phoneNumber: form.get("phoneNumber"),
        address: form.get("address"),
        password: form.get("password"),
      });
      event.target.reset();
      await this.loadAdmin();
      this.ui.message("Volunteer created.", "success");
    });

    document.getElementById("adminPage").addEventListener("click", async (event) => {
      const deleteEventId = event.target.dataset.deleteEvent;
      const deleteVolunteerId = event.target.dataset.deleteVolunteer;
      if (deleteEventId && confirm("Delete this event?")) {
        await this.storage.deleteEvent(deleteEventId);
        await this.loadAdmin();
      }
      if (deleteVolunteerId && confirm("Remove this volunteer?")) {
        await this.storage.deleteVolunteer(deleteVolunteerId);
        await this.loadAdmin();
      }
    });

    document.getElementById("adminPage").addEventListener("change", async (event) => {
      if (event.target.dataset.statusEvent) {
        await this.storage.updateEventStatus(event.target.dataset.statusEvent, event.target.value);
        await this.loadAdmin();
      }
      if (event.target.dataset.assignVolunteer && event.target.value) {
        await this.storage.assignVolunteer(event.target.value, event.target.dataset.assignVolunteer);
        await this.loadAdmin();
      }
    });

    document.getElementById("reminderForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!isFirebaseConfigured) {
        this.ui.message("Demo reminder created. SMS requires Firebase and Twilio.", "info");
        event.target.reset();
        return;
      }
      const form = new FormData(event.target);
      await functions.httpsCallable("createRemindersForEvent")({
        eventId: form.get("eventId"),
        hoursBeforeEvent: Number(form.get("hoursBeforeEvent")),
        message: form.get("message"),
      });
      event.target.reset();
      this.ui.message("Reminders created.", "success");
    });
  }

  bindVolunteerForms() {
    document.getElementById("profileForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      await this.storage.updateVolunteerProfile(this.session.uid, {
        name: form.get("name"),
        phoneNumber: form.get("phoneNumber"),
        address: form.get("address"),
      });
      await this.loadVolunteer();
      this.ui.message("Profile updated.", "success");
    });
  }

  bindGlobalActions() {
    document.getElementById("logoutBtn").addEventListener("click", async () => {
      await this.auth.logout();
      this.session = null;
      this.route();
    });
  }

  async loadAdmin() {
    const [events, volunteers] = await Promise.all([
      this.storage.getEvents(this.session),
      this.storage.getVolunteers(),
    ]);
    this.ui.renderAdmin(events, volunteers);
  }

  async loadVolunteer() {
    const [events, volunteers] = await Promise.all([
      this.storage.getEvents(this.session),
      this.storage.getVolunteers(),
    ]);
    const profile = volunteers.find((volunteer) => volunteer.uid === this.session.uid);
    this.ui.renderVolunteer(profile, events);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.app = new App();
  window.app.init();
});
