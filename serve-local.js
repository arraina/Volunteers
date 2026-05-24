const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "volunteers");
const dataDir = path.join(__dirname, ".local-db");
const dataFile = path.join(dataDir, "volunteers.json");
const port = Number(process.env.PORT || 5000);
const host = "127.0.0.1";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const seedData = {
  events: [
    {
      id: "event-community-cleanup",
      topic: "Community Cleanup",
      description: "Help clean up the temple grounds and organize supplies.",
      eventDateTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      location: "Temple Courtyard",
      assignedVolunteers: ["volunteer-demo"],
      status: "scheduled",
    },
    {
      id: "event-food-service",
      topic: "Food Service Shift",
      description: "Prepare and serve prasadam during the weekend program.",
      eventDateTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      location: "Community Hall",
      assignedVolunteers: [],
      status: "scheduled",
    },
  ],
  volunteers: [
    {
      id: "volunteer-demo",
      uid: "volunteer-demo",
      name: "Demo Volunteer",
      email: "volunteer@example.com",
      phoneNumber: "+15551234567",
      address: "123 Main St",
      joinedDate: new Date().toISOString(),
    },
  ],
  reminderRules: [],
};

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(seedData, null, 2));
  }
}

function readDb() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

function writeDb(data) {
  ensureDataFile();
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

async function handleApi(request, response, urlPath) {
  const db = readDb();

  if (request.method === "GET" && urlPath === "/api/events") {
    sendJson(response, 200, db.events);
    return true;
  }

  if (request.method === "POST" && urlPath === "/api/events") {
    const event = await readRequestJson(request);
    db.events.push({
      ...event,
      id: event.id || `event-${Date.now()}`,
      assignedVolunteers: event.assignedVolunteers || [],
      status: event.status || "scheduled",
    });
    writeDb(db);
    sendJson(response, 201, db.events[db.events.length - 1]);
    return true;
  }

  if (request.method === "PATCH" && urlPath.startsWith("/api/events/")) {
    const eventId = urlPath.split("/").pop();
    const updates = await readRequestJson(request);
    db.events = db.events.map((event) =>
      event.id === eventId ? { ...event, ...updates, updatedAt: new Date().toISOString() } : event
    );
    writeDb(db);
    sendJson(response, 200, { success: true });
    return true;
  }

  if (request.method === "DELETE" && urlPath.startsWith("/api/events/")) {
    const eventId = urlPath.split("/").pop();
    db.events = db.events.filter((event) => event.id !== eventId);
    db.reminderRules = db.reminderRules.filter((rule) => rule.eventId !== eventId);
    writeDb(db);
    sendJson(response, 200, { success: true });
    return true;
  }

  if (request.method === "GET" && urlPath === "/api/volunteers") {
    sendJson(response, 200, db.volunteers);
    return true;
  }

  if (request.method === "POST" && urlPath === "/api/volunteers") {
    const volunteer = await readRequestJson(request);
    const id = volunteer.id || `volunteer-${Date.now()}`;
    const savedVolunteer = {
      ...volunteer,
      id,
      uid: volunteer.uid || id,
      joinedDate: volunteer.joinedDate || new Date().toISOString(),
    };
    const existingIndex = db.volunteers.findIndex(
      (item) => item.id === savedVolunteer.id || item.uid === savedVolunteer.uid
    );
    if (existingIndex >= 0) {
      db.volunteers[existingIndex] = { ...db.volunteers[existingIndex], ...savedVolunteer };
    } else {
      db.volunteers.push(savedVolunteer);
    }
    writeDb(db);
    sendJson(response, 201, savedVolunteer);
    return true;
  }

  if (request.method === "PATCH" && urlPath.startsWith("/api/volunteers/")) {
    const volunteerId = urlPath.split("/").pop();
    const updates = await readRequestJson(request);
    db.volunteers = db.volunteers.map((volunteer) =>
      volunteer.id === volunteerId || volunteer.uid === volunteerId
        ? { ...volunteer, ...updates, updatedAt: new Date().toISOString() }
        : volunteer
    );
    writeDb(db);
    sendJson(response, 200, { success: true });
    return true;
  }

  if (request.method === "DELETE" && urlPath.startsWith("/api/volunteers/")) {
    const volunteerId = urlPath.split("/").pop();
    db.volunteers = db.volunteers.filter(
      (volunteer) => volunteer.id !== volunteerId && volunteer.uid !== volunteerId
    );
    db.events = db.events.map((event) => ({
      ...event,
      assignedVolunteers: event.assignedVolunteers.filter((id) => id !== volunteerId),
    }));
    db.reminderRules = db.reminderRules.filter((rule) => rule.volunteerId !== volunteerId);
    writeDb(db);
    sendJson(response, 200, { success: true });
    return true;
  }

  if (request.method === "GET" && urlPath === "/api/reminder-rules") {
    sendJson(response, 200, db.reminderRules);
    return true;
  }

  if (request.method === "POST" && urlPath === "/api/reminder-rules") {
    const rule = await readRequestJson(request);
    const savedRule = {
      ...rule,
      id: rule.id || `rule-${rule.eventId}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const existingIndex = db.reminderRules.findIndex((item) => item.eventId === savedRule.eventId);
    if (existingIndex >= 0) {
      db.reminderRules[existingIndex] = {
        ...db.reminderRules[existingIndex],
        ...savedRule,
        createdAt: db.reminderRules[existingIndex].createdAt,
      };
    } else {
      db.reminderRules.push(savedRule);
    }
    writeDb(db);
    sendJson(response, 201, savedRule);
    return true;
  }

  return false;
}

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(data);
  });
}

const server = http.createServer(async (request, response) => {
  const urlPath = decodeURIComponent((request.url || "/").split("?")[0]);

  if (urlPath.startsWith("/api/")) {
    try {
      const handled = await handleApi(request, response, urlPath);
      if (!handled) {
        sendJson(response, 404, { error: "API route not found" });
      }
    } catch (error) {
      sendJson(response, 500, { error: error.message || "Local API error" });
    }
    return;
  }

  const requestedPath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(root, requestedPath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  if (path.extname(filePath)) {
    sendFile(response, filePath);
    return;
  }

  sendFile(response, path.join(root, "index.html"));
});

server.listen(port, host, () => {
  console.log(`Temple Volunteers local server: http://${host}:${port}?demo=true`);
  console.log(`Local test database: ${dataFile}`);
});
