window.LOCAL_APP_DATA = {
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
};
