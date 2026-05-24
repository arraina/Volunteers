class UIManager {
  constructor(app) {
    this.app = app;
  }

  showPage(pageId) {
    document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
    document.getElementById(pageId).classList.add("active");
  }

  message(text, type = "info") {
    const box = document.getElementById("message");
    box.textContent = text;
    box.className = `message ${type}`;
    setTimeout(() => {
      box.textContent = "";
      box.className = "message";
    }, 3500);
  }

  formatDate(date) {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  renderHeader(session) {
    document.getElementById("currentUser").textContent = session ? session.email : "";
    document.getElementById("logoutBtn").style.display = session ? "inline-flex" : "none";
  }

  renderAdmin(events, volunteers, reminderRules) {
    const reminderRuleByEventId = new Map(reminderRules.map((rule) => [rule.eventId, rule]));
    document.getElementById("eventsList").innerHTML = events
      .map(
        (event) => {
          const rule = reminderRuleByEventId.get(event.id);
          return `
            <article class="card">
              <div class="card-title-row">
                <h3>${event.topic}</h3>
                <button class="btn danger" data-delete-event="${event.id}">Delete</button>
              </div>
              <p>${event.description || ""}</p>
              <p><strong>Date:</strong> ${this.formatDate(event.eventDateTime)}</p>
              <p><strong>Location:</strong> ${event.location || "TBD"}</p>
              <p><strong>Assigned:</strong> ${event.assignedVolunteers.length}</p>
              <p><strong>Reminder:</strong> ${
                rule
                  ? `${rule.hoursBeforeEvent} hours before${rule.sendTime ? ` at ${rule.sendTime}` : ""}`
                  : "No rule saved"
              }</p>
              <label>Status
                <select data-status-event="${event.id}">
                  ${["scheduled", "ongoing", "completed", "cancelled"]
                    .map((status) => `<option value="${status}" ${event.status === status ? "selected" : ""}>${status}</option>`)
                    .join("")}
                </select>
              </label>
            </article>
          `;
        }
      )
      .join("");

    document.getElementById("volunteersList").innerHTML = volunteers
      .map(
        (volunteer) => `
          <article class="card">
            <div class="card-title-row">
              <h3>${volunteer.name}</h3>
              <button class="btn danger" data-delete-volunteer="${volunteer.id}">Remove</button>
            </div>
            <p><strong>Email:</strong> ${volunteer.email}</p>
            <p><strong>Phone:</strong> ${volunteer.phoneNumber}</p>
            <p><strong>Address:</strong> ${volunteer.address || "N/A"}</p>
            <select data-assign-volunteer="${volunteer.id}">
              <option value="">Assign to event...</option>
              ${events.map((event) => `<option value="${event.id}">${event.topic}</option>`).join("")}
            </select>
          </article>
        `
      )
      .join("");

    document.getElementById("reminderEvent").innerHTML =
      '<option value="">Select event</option>' +
      events.map((event) => `<option value="${event.id}">${event.topic}</option>`).join("");

    const eventNameById = new Map(events.map((event) => [event.id, event.topic]));
    document.getElementById("reminderRulesList").innerHTML =
      reminderRules.length === 0
        ? '<p class="empty">No reminder rules yet.</p>'
        : reminderRules
            .map(
              (rule) => `
                <article class="card">
                  <h3>${eventNameById.get(rule.eventId) || "Deleted event"}</h3>
                  <p><strong>Hours before:</strong> ${rule.hoursBeforeEvent}</p>
                  <p><strong>Send time:</strong> ${rule.sendTime || "Calculated from event time"}</p>
                  <p>${rule.message}</p>
                </article>
              `
            )
            .join("");
  }

  renderVolunteer(profile, events, session) {
    const claimPanel = document.getElementById("claimAdminPanel");
    claimPanel.style.display =
      isFirebaseConfigured && !useDemoMode && session && !session.isAdmin ? "block" : "none";

    document.getElementById("profileName").value = profile?.name || "";
    document.getElementById("profilePhone").value = profile?.phoneNumber || "";
    document.getElementById("profileAddress").value = profile?.address || "";

    document.getElementById("assignedEvents").innerHTML =
      events.length === 0
        ? '<p class="empty">No assigned events yet.</p>'
        : events
            .map(
              (event) => `
                <article class="card">
                  <div class="card-title-row">
                    <h3>${event.topic}</h3>
                    <span class="status">${event.status}</span>
                  </div>
                  <p>${event.description || ""}</p>
                  <p><strong>Date:</strong> ${this.formatDate(event.eventDateTime)}</p>
                  <p><strong>Location:</strong> ${event.location || "TBD"}</p>
                </article>
              `
            )
            .join("");
  }
}
