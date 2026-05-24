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

  renderAdmin(events, volunteers) {
    document.getElementById("eventsList").innerHTML = events
      .map(
        (event) => `
          <article class="card">
            <div class="card-title-row">
              <h3>${event.topic}</h3>
              <button class="btn danger" data-delete-event="${event.id}">Delete</button>
            </div>
            <p>${event.description || ""}</p>
            <p><strong>Date:</strong> ${this.formatDate(event.eventDateTime)}</p>
            <p><strong>Location:</strong> ${event.location || "TBD"}</p>
            <p><strong>Assigned:</strong> ${event.assignedVolunteers.length}</p>
            <label>Status
              <select data-status-event="${event.id}">
                ${["scheduled", "ongoing", "completed", "cancelled"]
                  .map((status) => `<option value="${status}" ${event.status === status ? "selected" : ""}>${status}</option>`)
                  .join("")}
              </select>
            </label>
          </article>
        `
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
  }

  renderVolunteer(profile, events) {
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
