const { createHash, randomBytes, randomUUID } = require('crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { onDocumentWrittenWithAuthContext } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const whatsappWebhookVerifyToken = defineSecret('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
const whatsappAccessToken = defineSecret('WHATSAPP_ACCESS_TOKEN');

const PORTAL_INVITE_TEMPLATE = 'volunteer_portal_invite_v1';
const PORTAL_INVITE_LANGUAGE = 'en';
const WHATSAPP_PHONE_NUMBER_ID = '1279758458557456';
const PORTAL_INVITE_TTL_DAYS = 7;
const FUNDRAISING_SHARE_TTL_DAYS = 5;
const GOVINDAS_SHARE_TTL_DAYS = 14;
const EVENT_FEEDBACK_SHARE_TTL_DAYS = 30;
const PORTAL_URL = 'https://arraina.github.io/Volunteers/claim';

const DEFAULT_DEPARTMENTS = [
  ['facilities', 'Facilities', 'Building, grounds, technology, safety, and property support.'],
  ['finance-legal', 'Finance & Legal', 'Accounting, grants, donations, insurance, legal, and audit support.'],
  ['communications', 'Communications', 'Website, social media, newsletters, announcements, and media.'],
  ['festivals-events', 'Festivals & Events', 'Festival planning, programs, hospitality, prasadam, and parking.'],
  ['congregation-development', 'Congregation Development', 'Devotee care, education, youth, children, and community engagement.'],
  ['temple-operations', 'Temple Operations', 'Pujari services, bhoga, Sunday programs, catering, rentals, and daily operations.'],
  ['new-temple', 'New Temple', 'Design, project management, construction, vendors, technology, and compliance.'],
  ['fundraising', 'Fundraising', 'Campaigns, donor stewardship, pledges, loans, and donations.'],
  ['govindas', "Govinda's", 'Weekly menus, food ordering, fulfillment, and customer service.'],
];

const WHATSAPP_STATUS_RANK = { accepted: 0, sent: 1, delivered: 2, read: 3 };

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) {
    throw new HttpsError('invalid-argument', 'Enter a valid international phone number including country code.');
  }
  return `+${digits}`;
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function normalizedTaskTitle(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function validReminderHours(value) {
  if (!Array.isArray(value) || value.length > 2) return false;
  const hours = [...new Set(value.map(Number))].sort((a, b) => b - a);
  return hours.length === value.length && hours.every((item) => Number.isFinite(item) && item > 0)
    && (hours.length < 2 || Math.abs(hours[0] - hours[1]) >= 24);
}

async function requireAdmin(request, ownerOnly = false) {
  if (!request.auth || request.auth.token.email_verified !== true) {
    throw new HttpsError('unauthenticated', 'A verified administrator account is required.');
  }
  const snapshot = await db.doc(`admins/${request.auth.uid}`).get();
  const data = snapshot.data() || {};
  if (!snapshot.exists || data.isAdmin !== true) throw new HttpsError('permission-denied', 'Administrator access is required.');
  if (ownerOnly && data.role !== 'owner' && data.bootstrap !== true) {
    throw new HttpsError('permission-denied', 'Owner access is required.');
  }
}

async function requireVerifiedUser(request) {
  if (!request.auth || request.auth.token.email_verified !== true) {
    throw new HttpsError('unauthenticated', 'A verified account is required.');
  }
}

async function callerAccess(uid) {
  const snapshot = await db.doc(`admins/${uid}`).get();
  const data = snapshot.data() || {};
  return { isOwner: snapshot.exists && data.isAdmin === true && (data.role === 'owner' || data.bootstrap === true) };
}

async function requireDepartmentAccess(request, departmentId, manage = false) {
  await requireVerifiedUser(request);
  const access = await callerAccess(request.auth.uid);
  if (access.isOwner) return { isOwner: true, isDepartmentAdmin: true };
  const membership = await db.doc(`departmentMemberships/${departmentId}_${request.auth.uid}`).get();
  const data = membership.data() || {};
  if (!membership.exists || data.active !== true || data.departmentId !== departmentId) {
    throw new HttpsError('permission-denied', 'You do not have access to this department.');
  }
  const isDepartmentAdmin = data.role === 'admin';
  if (manage && !isDepartmentAdmin) throw new HttpsError('permission-denied', 'Department Admin access is required.');
  return { isOwner: false, isDepartmentAdmin };
}

exports.initializeDepartments = onCall({ region: 'us-central1', maxInstances: 2 }, async (request) => {
  await requireAdmin(request, true);
  const batch = db.batch();
  const existing = await db.collection('departments').get();
  const existingIds = new Set(existing.docs.map((item) => item.id));
  let created = 0;
  DEFAULT_DEPARTMENTS.forEach(([id, name, description], index) => {
    if (existingIds.has(id)) return;
    batch.set(db.doc(`departments/${id}`), {
      name, description, active: true, sortOrder: index + 1,
      createdBy: request.auth.uid, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    created += 1;
  });
  if (created) await batch.commit();
  return { created };
});

exports.getDepartmentDirectory = onCall({ region: 'us-central1', maxInstances: 8 }, async (request) => {
  await requireVerifiedUser(request);
  const access = await callerAccess(request.auth.uid);
  const [departmentsSnapshot, membershipsSnapshot] = await Promise.all([
    db.collection('departments').where('active', '==', true).get(), db.collection('departmentMemberships').get(),
  ]);
  const callerAdminDepartmentIds = new Set(membershipsSnapshot.docs
    .filter((item) => item.data().userId === request.auth.uid && item.data().active === true && item.data().role === 'admin')
    .map((item) => item.data().departmentId));
  const accessibleDepartmentIds = new Set(membershipsSnapshot.docs
    .filter((item) => item.data().userId === request.auth.uid && item.data().active === true)
    .map((item) => item.data().departmentId));
  const visibleMemberships = membershipsSnapshot.docs.filter((item) => {
    const data = item.data();
    return data.active === true && (access.isOwner || callerAdminDepartmentIds.has(data.departmentId) || data.userId === request.auth.uid);
  });
  const userIds = [...new Set(visibleMemberships.map((item) => item.data().userId).filter(Boolean))];
  const volunteers = new Map();
  for (let i = 0; i < userIds.length; i += 100) {
    const snapshots = await Promise.all(userIds.slice(i, i + 100).map((uid) => db.doc(`volunteers/${uid}`).get()));
    snapshots.forEach((item) => {
      const data = item.data() || {};
      volunteers.set(item.id, data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Volunteer');
    });
  }
  return {
    isOwner: access.isOwner,
    managedDepartmentIds: [...callerAdminDepartmentIds],
    accessibleDepartmentIds: access.isOwner ? departmentsSnapshot.docs.map((item) => item.id) : [...accessibleDepartmentIds],
    departments: departmentsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)),
    memberships: visibleMemberships.map((item) => {
      const data = item.data();
      return { id: item.id, departmentId: data.departmentId, userId: data.userId, role: data.role, name: volunteers.get(data.userId) || 'Unknown volunteer' };
    }),
  };
});

exports.setDepartmentMembership = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  await requireVerifiedUser(request);
  const departmentId = String(request.data?.departmentId || '').trim();
  const userId = String(request.data?.userId || '').trim();
  const role = String(request.data?.role || '').trim();
  const active = request.data?.active === true;
  if (!departmentId || !userId || !['admin', 'member'].includes(role) || departmentId.includes('/') || userId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Choose a valid department, volunteer, and access level.');
  }
  const [department, volunteer, access, callerMembership] = await Promise.all([
    db.doc(`departments/${departmentId}`).get(), db.doc(`volunteers/${userId}`).get(), callerAccess(request.auth.uid),
    db.doc(`departmentMemberships/${departmentId}_${request.auth.uid}`).get(),
  ]);
  if (!department.exists || department.data().active !== true) throw new HttpsError('not-found', 'Department was not found.');
  if (!volunteer.exists || volunteer.data().deleted === true) throw new HttpsError('not-found', 'Active volunteer was not found.');
  const isDepartmentAdmin = callerMembership.exists && callerMembership.data().active === true && callerMembership.data().role === 'admin';
  if (role === 'admin' && !access.isOwner) throw new HttpsError('permission-denied', 'Only the Owner can change Department Admin access.');
  if (role === 'member' && !access.isOwner && !isDepartmentAdmin) throw new HttpsError('permission-denied', 'Department Admin access is required.');
  const ref = db.doc(`departmentMemberships/${departmentId}_${userId}`);
  if (active) {
    await ref.set({ departmentId, userId, role, active: true, updatedBy: request.auth.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(), createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } else {
    const current = await ref.get();
    if (current.exists && current.data().role === 'admin' && !access.isOwner) throw new HttpsError('permission-denied', 'Only the Owner can remove a Department Admin.');
    await ref.delete();
  }
  return { updated: true };
});

const DEPARTMENT_ITEM_COLLECTIONS = {
  task: 'departmentTasks', event: 'departmentEvents', announcement: 'departmentAnnouncements',
};

exports.getDepartmentWorkspace = onCall({ region: 'us-central1', maxInstances: 8 }, async (request) => {
  const departmentId = String(request.data?.departmentId || '').trim();
  if (!departmentId || departmentId.includes('/')) throw new HttpsError('invalid-argument', 'Choose a valid department.');
  const access = await requireDepartmentAccess(request, departmentId);
  const department = await db.doc(`departments/${departmentId}`).get();
  if (!department.exists || department.data().active !== true) throw new HttpsError('not-found', 'Department was not found.');
  const snapshots = await Promise.all(Object.values(DEPARTMENT_ITEM_COLLECTIONS).map((collectionName) =>
    db.collection(collectionName).where('departmentId', '==', departmentId).get()));
  const normalizeItems = (snapshot) => snapshot.docs.filter((item) => item.data().archived !== true).map((item) => {
    const data = item.data();
    return { id: item.id, ...data, dateMillis: data.date?.toMillis?.() || null, createdAtMillis: data.createdAt?.toMillis?.() || null };
  });
  return {
    canManage: access.isDepartmentAdmin,
    department: { id: department.id, name: department.data().name, description: department.data().description },
    tasks: normalizeItems(snapshots[0]), events: normalizeItems(snapshots[1]), announcements: normalizeItems(snapshots[2]),
  };
});

exports.createDepartmentItem = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  const departmentId = String(request.data?.departmentId || '').trim();
  const type = String(request.data?.type || '').trim();
  const title = String(request.data?.title || '').trim();
  const details = String(request.data?.details || '').trim();
  const dateMillis = request.data?.dateMillis == null ? null : Number(request.data.dateMillis);
  if (!departmentId || departmentId.includes('/') || !DEPARTMENT_ITEM_COLLECTIONS[type] || !title || title.length > 180 || details.length > 5000) {
    throw new HttpsError('invalid-argument', 'Enter a valid title and department item.');
  }
  if ((type === 'task' || type === 'event') && (!Number.isFinite(dateMillis) || dateMillis < Date.now() - 60000)) {
    throw new HttpsError('invalid-argument', 'Choose a current or future date and time.');
  }
  await requireDepartmentAccess(request, departmentId, true);
  const ref = db.collection(DEPARTMENT_ITEM_COLLECTIONS[type]).doc();
  await ref.set({ departmentId, title, details, date: dateMillis == null ? null : admin.firestore.Timestamp.fromMillis(dateMillis),
    status: type === 'task' ? 'open' : 'active', archived: false, createdBy: request.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { id: ref.id };
});

exports.updateDepartmentItem = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  const departmentId = String(request.data?.departmentId || '').trim();
  const type = String(request.data?.type || '').trim();
  const itemId = String(request.data?.itemId || '').trim();
  const action = String(request.data?.action || '').trim();
  if (!departmentId || !itemId || departmentId.includes('/') || itemId.includes('/') || !DEPARTMENT_ITEM_COLLECTIONS[type] || !['complete', 'reopen', 'archive'].includes(action)) {
    throw new HttpsError('invalid-argument', 'Choose a valid department item and action.');
  }
  await requireDepartmentAccess(request, departmentId, true);
  const ref = db.doc(`${DEPARTMENT_ITEM_COLLECTIONS[type]}/${itemId}`);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().departmentId !== departmentId) throw new HttpsError('not-found', 'Department item was not found.');
  const change = action === 'archive' ? { archived: true } : { status: action === 'complete' ? 'completed' : 'open' };
  await ref.update({ ...change, updatedBy: request.auth.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { updated: true };
});

function cleanGovindasItems(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new HttpsError('invalid-argument', 'Add between 1 and 50 menu items.');
  return value.map((item, index) => {
    const id = String(item?.id || `item-${index + 1}`).trim().slice(0, 80);
    const name = String(item?.name || '').trim().slice(0, 120);
    const description = String(item?.description || '').trim().slice(0, 500);
    const imageUrl = String(item?.imageUrl || '').trim().slice(0, 2000);
    const imagePath = String(item?.imagePath || '').trim().slice(0, 500);
    const priceCents = Math.round(Number(item?.priceCents));
    if (!id || !name || !Number.isInteger(priceCents) || priceCents < 0 || priceCents > 10000000) throw new HttpsError('invalid-argument', `Check menu item ${index + 1}.`);
    if ((imageUrl || imagePath) && (!imageUrl.startsWith('https://firebasestorage.googleapis.com/') || !/^govindas\/menu-items\/[^/]+$/.test(imagePath))) {
      throw new HttpsError('invalid-argument', `Check the image for menu item ${index + 1}.`);
    }
    return { id, name, description, imageUrl, imagePath, priceCents, available: item?.available !== false };
  });
}

exports.uploadGovindasItemImage = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  await requireDepartmentAccess(request, 'govindas', true);
  const dataUrl = String(request.data?.dataUrl || '');
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new HttpsError('invalid-argument', 'Choose a JPG, PNG, WebP, or GIF image.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length >= 5 * 1024 * 1024) throw new HttpsError('invalid-argument', 'The image must be smaller than 5 MB.');
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[match[1]];
  const imagePath = `govindas/menu-items/${randomUUID()}.${extension}`;
  const downloadToken = randomUUID();
  await admin.storage().bucket().file(imagePath).save(bytes, { resumable: false, metadata: {
    contentType: match[1], cacheControl: 'public,max-age=31536000,immutable', metadata: { firebaseStorageDownloadTokens: downloadToken },
  } });
  const bucketName = admin.storage().bucket().name;
  return { imagePath, imageUrl: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(imagePath)}?alt=media&token=${downloadToken}` };
});

exports.deleteGovindasItemImage = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  await requireDepartmentAccess(request, 'govindas', true);
  const imagePath = String(request.data?.imagePath || '').trim();
  if (!/^govindas\/menu-items\/[^/]+$/.test(imagePath)) throw new HttpsError('invalid-argument', 'Choose a valid Govinda’s item image.');
  await admin.storage().bucket().file(imagePath).delete({ ignoreNotFound: true });
  return { deleted: true };
});

function cleanFeedbackInput(data) {
  const rating = Math.round(Number(data?.rating));
  const feedbackText = String(data?.feedbackText || '').trim().slice(0, 5000);
  const respondentName = String(data?.respondentName || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !feedbackText) {
    throw new HttpsError('invalid-argument', 'Choose a 1–5 star rating and enter feedback.');
  }
  return { rating, feedbackText, respondentName };
}

exports.submitAuthenticatedEventFeedback = onCall({ region: 'us-central1', maxInstances: 8 }, async (request) => {
  await requireVerifiedUser(request);
  const eventId = String(request.data?.eventId || '').trim();
  if (!eventId || eventId.includes('/')) throw new HttpsError('invalid-argument', 'Choose a valid event.');
  const event = await db.doc(`events/${eventId}`).get();
  if (!event.exists || event.data().deleted === true) throw new HttpsError('not-found', 'Event was not found.');
  const input = cleanFeedbackInput(request.data);
  const anonymous = request.data?.anonymous === true;
  await db.doc(`eventFeedback/${eventId}_${request.auth.uid}`).set({ eventId, volunteerId: request.auth.uid,
    ...input, respondentName: anonymous ? '' : input.respondentName, anonymous, source: 'signed-in',
    updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { saved: true };
});

exports.createEventFeedbackShareLink = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  await requireVerifiedUser(request);
  const eventId = String(request.data?.eventId || '').trim();
  if (!eventId || eventId.includes('/')) throw new HttpsError('invalid-argument', 'Choose a valid event.');
  const [event, access] = await Promise.all([db.doc(`events/${eventId}`).get(), callerAccess(request.auth.uid)]);
  if (!event.exists || event.data().deleted === true) throw new HttpsError('not-found', 'Event was not found.');
  if (!access.isOwner && event.data().createdBy !== request.auth.uid) throw new HttpsError('permission-denied', 'Only the event creator or Owner can create this feedback link.');
  const token = `${eventId}.${randomBytes(32).toString('base64url')}`;
  const expiresAtMillis = Date.now() + EVENT_FEEDBACK_SHARE_TTL_DAYS * 86400_000;
  await db.doc(`eventFeedbackShareLinks/${eventId}`).set({ eventId, tokenHash: tokenHash(token),
    expiresAt: admin.firestore.Timestamp.fromMillis(expiresAtMillis), createdBy: request.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp() });
  return { token, expiresAtMillis };
});

async function publicFeedbackEvent(token) {
  const value = String(token || '').trim(); const separator = value.indexOf('.');
  const eventId = separator > 0 ? value.slice(0, separator) : '';
  if (!eventId || eventId.includes('/') || value.length > 500) throw new HttpsError('invalid-argument', 'This feedback link is invalid.');
  const [link, event] = await Promise.all([db.doc(`eventFeedbackShareLinks/${eventId}`).get(), db.doc(`events/${eventId}`).get()]);
  const linkData = link.data() || {};
  if (!link.exists || linkData.tokenHash !== tokenHash(value) || !linkData.expiresAt || linkData.expiresAt.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', 'This feedback link has expired.');
  if (!event.exists || event.data().deleted === true) throw new HttpsError('not-found', 'Event was not found.');
  return { eventId, event: event.data(), expiresAtMillis: linkData.expiresAt.toMillis() };
}

exports.getPublicEventFeedbackForm = onCall({ region: 'us-central1', maxInstances: 12 }, async (request) => {
  const result = await publicFeedbackEvent(request.data?.token);
  return { event: { id: result.eventId, name: result.event.name,
    dateMillis: result.event.date?.toMillis?.() || null }, expiresAtMillis: result.expiresAtMillis };
});

exports.submitPublicEventFeedback = onCall({ region: 'us-central1', maxInstances: 12 }, async (request) => {
  const result = await publicFeedbackEvent(request.data?.token);
  const input = cleanFeedbackInput(request.data);
  await db.collection('eventFeedback').add({ eventId: result.eventId, ...input, anonymous: !input.respondentName,
    source: 'public-link', createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { saved: true };
});

exports.saveGovindasMenu = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  await requireDepartmentAccess(request, 'govindas', true);
  const menuId = String(request.data?.menuId || '').trim();
  const title = String(request.data?.title || '').trim().slice(0, 160);
  const pickupDetails = String(request.data?.pickupDetails || '').trim().slice(0, 1000);
  const zelleInstructions = String(request.data?.zelleInstructions || '').trim().slice(0, 500);
  const cutoffMillis = Number(request.data?.cutoffMillis);
  const pickupMillis = Number(request.data?.pickupMillis);
  const items = cleanGovindasItems(request.data?.items);
  if (!title || !Number.isFinite(cutoffMillis) || !Number.isFinite(pickupMillis) || cutoffMillis <= Date.now() || pickupMillis <= cutoffMillis) {
    throw new HttpsError('invalid-argument', 'Enter a title, a future order cutoff, and a pickup time after the cutoff.');
  }
  const ref = menuId && !menuId.includes('/') ? db.doc(`govindasMenus/${menuId}`) : db.collection('govindasMenus').doc();
  const existing = await ref.get();
  if (existing.exists && existing.data().locked === true) throw new HttpsError('failed-precondition', 'This menu is locked and cannot be changed.');
  await ref.set({ title, pickupDetails, zelleInstructions, items, cutoffAt: admin.firestore.Timestamp.fromMillis(cutoffMillis),
    pickupAt: admin.firestore.Timestamp.fromMillis(pickupMillis), active: true, locked: false,
    createdBy: existing.exists ? existing.data().createdBy : request.auth.uid,
    createdAt: existing.exists ? existing.data().createdAt : admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: request.auth.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { menuId: ref.id };
});

exports.getGovindasAdminData = onCall({ region: 'us-central1', maxInstances: 8 }, async (request) => {
  await requireDepartmentAccess(request, 'govindas', true);
  const [menus, orders] = await Promise.all([db.collection('govindasMenus').get(), db.collection('govindasOrders').get()]);
  const menuData = menus.docs.map((item) => { const data = item.data(); return { id: item.id, title: data.title,
    pickupDetails: data.pickupDetails, zelleInstructions: data.zelleInstructions, items: data.items || [],
    active: data.active === true, locked: data.locked === true, cutoffMillis: data.cutoffAt?.toMillis?.() || null,
    pickupMillis: data.pickupAt?.toMillis?.() || null }; }).sort((a, b) => (b.pickupMillis || 0) - (a.pickupMillis || 0));
  const orderData = orders.docs.map((item) => { const data = item.data(); return { id: item.id, menuId: data.menuId,
    menuTitle: data.menuTitle, customerName: data.customerName, phoneNumber: data.phoneNumber,
    zelleReference: data.zelleReference, items: data.items || [], totalCents: data.totalCents, status: data.status,
    createdAtMillis: data.createdAt?.toMillis?.() || null }; }).sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
  return { menus: menuData, orders: orderData };
});

exports.createGovindasShareLink = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  await requireDepartmentAccess(request, 'govindas', true);
  const menuId = String(request.data?.menuId || '').trim();
  if (!menuId || menuId.includes('/')) throw new HttpsError('invalid-argument', 'Choose a valid menu.');
  const menu = await db.doc(`govindasMenus/${menuId}`).get();
  if (!menu.exists) throw new HttpsError('not-found', 'Menu was not found.');
  const token = `${menuId}.${randomBytes(32).toString('base64url')}`;
  const expiresMillis = Math.min(Date.now() + GOVINDAS_SHARE_TTL_DAYS * 86400_000, (menu.data().pickupAt?.toMillis?.() || Date.now()) + 86400_000);
  const expiresAt = admin.firestore.Timestamp.fromMillis(expiresMillis);
  await db.doc(`govindasShareLinks/${menuId}`).set({ menuId, tokenHash: tokenHash(token), expiresAt,
    createdBy: request.auth.uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  return { token, expiresAtMillis: expiresMillis };
});

async function publicGovindasMenu(token) {
  const value = String(token || '').trim();
  const separator = value.indexOf('.');
  const menuId = separator > 0 ? value.slice(0, separator) : '';
  if (!menuId || menuId.includes('/') || value.length > 500) throw new HttpsError('invalid-argument', 'This Govinda’s menu link is invalid.');
  const [link, menu] = await Promise.all([db.doc(`govindasShareLinks/${menuId}`).get(), db.doc(`govindasMenus/${menuId}`).get()]);
  const linkData = link.data() || {};
  if (!link.exists || linkData.tokenHash !== tokenHash(value) || !linkData.expiresAt || linkData.expiresAt.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', 'This Govinda’s menu link has expired.');
  if (!menu.exists || menu.data().active !== true) throw new HttpsError('not-found', 'This menu is no longer available.');
  return { menuId, menu: menu.data(), expiresAtMillis: linkData.expiresAt.toMillis() };
}

exports.getPublicGovindasMenu = onCall({ region: 'us-central1', maxInstances: 12 }, async (request) => {
  const result = await publicGovindasMenu(request.data?.token);
  const data = result.menu;
  return { menu: { id: result.menuId, title: data.title, pickupDetails: data.pickupDetails,
    zelleInstructions: data.zelleInstructions, cutoffMillis: data.cutoffAt?.toMillis?.() || null,
    pickupMillis: data.pickupAt?.toMillis?.() || null, items: (data.items || []).filter((item) => item.available !== false) }, expiresAtMillis: result.expiresAtMillis };
});

exports.placeGovindasOrder = onCall({ region: 'us-central1', maxInstances: 12 }, async (request) => {
  const result = await publicGovindasMenu(request.data?.token);
  const customerName = String(request.data?.customerName || '').trim().slice(0, 160);
  const phoneNumber = normalizePhone(request.data?.phoneNumber);
  const zelleReference = String(request.data?.zelleReference || '').trim().slice(0, 160);
  const requested = Array.isArray(request.data?.items) ? request.data.items : [];
  if (!customerName || !zelleReference || result.menu.cutoffAt.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', 'Enter your name and Zelle reference before the order cutoff.');
  const menuItems = new Map((result.menu.items || []).filter((item) => item.available !== false).map((item) => [item.id, item]));
  const items = requested.map((item) => {
    const menuItem = menuItems.get(String(item?.itemId || ''));
    const quantity = Math.floor(Number(item?.quantity));
    if (!menuItem || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) throw new HttpsError('invalid-argument', 'Check the selected quantities.');
    return { itemId: menuItem.id, name: menuItem.name, quantity, unitPriceCents: menuItem.priceCents, lineTotalCents: menuItem.priceCents * quantity };
  });
  if (!items.length || items.length > 50) throw new HttpsError('invalid-argument', 'Select at least one menu item.');
  const totalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const confirmationToken = randomBytes(24).toString('base64url');
  const ref = db.collection('govindasOrders').doc();
  await ref.set({ menuId: result.menuId, menuTitle: result.menu.title, customerName, phoneNumber, zelleReference,
    items, totalCents, status: 'received', confirmationTokenHash: tokenHash(confirmationToken),
    createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { orderId: ref.id, confirmationToken, totalCents, status: 'received' };
});

exports.getPublicGovindasOrderStatus = onCall({ region: 'us-central1', maxInstances: 12 }, async (request) => {
  const orderId = String(request.data?.orderId || '').trim();
  const confirmationToken = String(request.data?.confirmationToken || '').trim();
  if (!orderId || orderId.includes('/') || orderId.length > 200 || !confirmationToken || confirmationToken.length > 500) {
    throw new HttpsError('invalid-argument', 'This order confirmation link is invalid.');
  }
  const order = await db.doc(`govindasOrders/${orderId}`).get();
  const data = order.data() || {};
  if (!order.exists || !data.confirmationTokenHash || data.confirmationTokenHash !== tokenHash(confirmationToken)) {
    throw new HttpsError('not-found', 'This order confirmation could not be found.');
  }
  return { order: { id: order.id, menuTitle: data.menuTitle, customerName: data.customerName,
    items: data.items || [], totalCents: data.totalCents, status: data.status,
    createdAtMillis: data.createdAt?.toMillis?.() || null } };
});

exports.updateGovindasOrderStatus = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  await requireDepartmentAccess(request, 'govindas', true);
  const orderId = String(request.data?.orderId || '').trim();
  const status = String(request.data?.status || '').trim();
  if (!orderId || orderId.includes('/') || !['received', 'confirmed', 'ready', 'completed', 'cancelled'].includes(status)) throw new HttpsError('invalid-argument', 'Choose a valid order status.');
  await db.doc(`govindasOrders/${orderId}`).update({ status, updatedBy: request.auth.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { updated: true };
});

exports.createFundraisingShareLink = onCall({ region: 'us-central1', maxInstances: 2 }, async (request) => {
  await requireAdmin(request, true);
  const eventId = String(request.data?.eventId || '').trim();
  if (!eventId || eventId.includes('/') || eventId.length > 200) {
    throw new HttpsError('invalid-argument', 'Choose a valid fundraising dashboard.');
  }
  const campaign = await db.doc(`fundraisingCampaigns/${eventId}`).get();
  if (!campaign.exists) throw new HttpsError('not-found', 'Save the fundraising dashboard before creating a link.');

  const token = `${eventId}.${randomBytes(32).toString('base64url')}`;
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + FUNDRAISING_SHARE_TTL_DAYS * 86400_000);
  await db.doc(`fundraisingShareLinks/${eventId}`).set({
    eventId,
    tokenHash: tokenHash(token),
    expiresAt,
    createdBy: request.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { token, expiresAtMillis: expiresAt.toMillis() };
});

exports.getSharedFundraisingDashboard = onCall({ region: 'us-central1', maxInstances: 8 }, async (request) => {
  if (!request.auth || request.auth.token.email_verified !== true) {
    throw new HttpsError('unauthenticated', 'Sign in with a verified app account to view this dashboard.');
  }
  const token = String(request.data?.token || '').trim();
  const separator = token.indexOf('.');
  const eventId = separator > 0 ? token.slice(0, separator) : '';
  if (!eventId || eventId.includes('/') || eventId.length > 200 || token.length > 500) {
    throw new HttpsError('invalid-argument', 'This fundraising dashboard link is invalid.');
  }
  const link = await db.doc(`fundraisingShareLinks/${eventId}`).get();
  const linkData = link.data() || {};
  if (!link.exists || linkData.tokenHash !== tokenHash(token) || !linkData.expiresAt || linkData.expiresAt.toMillis() <= Date.now()) {
    throw new HttpsError('failed-precondition', 'This fundraising dashboard link has expired. Ask the Owner to generate a new link.');
  }
  const campaign = await db.doc(`fundraisingCampaigns/${eventId}`).get();
  if (!campaign.exists) throw new HttpsError('not-found', 'This fundraising dashboard is no longer available.');
  const data = campaign.data() || {};
  return {
    campaign: {
      eventId,
      dashboardName: String(data.dashboardName || ''),
      spotlightThreshold: Number(data.spotlightThreshold) > 0 ? Number(data.spotlightThreshold) : 15000,
      spotlightGapSeconds: Number(data.spotlightGapSeconds) >= 0 ? Number(data.spotlightGapSeconds) : 18,
      targetAmount: Number(data.targetAmount) || 0,
      startingCurrentAmount: Number(data.startingCurrentAmount) || 0,
      entries: Array.isArray(data.entries) ? data.entries : [],
    },
    expiresAtMillis: linkData.expiresAt.toMillis(),
  };
});

exports.setFundraisingCampaignLock = onCall({ region: 'us-central1', maxInstances: 2 }, async (request) => {
  await requireAdmin(request, true);
  const eventId = String(request.data?.eventId || '').trim();
  const locked = request.data?.locked === true;
  if (!eventId || eventId.includes('/') || eventId.length > 200) {
    throw new HttpsError('invalid-argument', 'Choose a valid fundraising dashboard.');
  }
  const campaignRef = db.doc(`fundraisingCampaigns/${eventId}`);
  const campaign = await campaignRef.get();
  if (!campaign.exists) throw new HttpsError('not-found', 'Save the fundraising dashboard before freezing it.');
  await campaignRef.update({
    locked,
    lockedAt: locked ? admin.firestore.FieldValue.serverTimestamp() : null,
    lockedBy: locked ? request.auth.uid : null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { locked };
});

exports.createOfflineVolunteer = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  await requireAdmin(request);
  const firstName = String(request.data?.firstName || '').trim();
  const lastName = String(request.data?.lastName || '').trim();
  const email = String(request.data?.email || '').trim().toLowerCase();
  const phoneNumber = normalizePhone(request.data?.phoneNumber);
  if (!firstName || !lastName) throw new HttpsError('invalid-argument', 'First and last name are required.');
  if (email) throw new HttpsError('invalid-argument', 'Use the existing email invitation flow when an email is supplied.');
  const duplicate = await db.collection('volunteers').where('phoneNumber', '==', phoneNumber).limit(1).get();
  if (!duplicate.empty) throw new HttpsError('already-exists', 'A volunteer with this phone number already exists.');
  const ref = db.collection('volunteers').doc();
  await ref.set({
    firstName, lastName, name: `${firstName} ${lastName}`.trim(), email: '', phoneNumber,
    skills: [], availability: [], notificationPrefs: { whatsapp: true, email: false },
    whatsappOptIn: true, whatsappOptInAt: admin.firestore.FieldValue.serverTimestamp(),
    whatsappOptOutAt: null, whatsappOptInSource: 'admin-confirmed', participationStatus: 'active',
    invitationStatus: 'waiting_for_template', portalRegistrationStatus: 'unclaimed',
    invitationSendCount: 0, totalHours: 0, createdBy: request.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    joinedDate: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { volunteerId: ref.id, invitationStatus: 'waiting_for_template' };
});

exports.assertVolunteerPhoneAvailable = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before checking a volunteer phone number.');
  const phoneNumber = normalizePhone(request.data?.phoneNumber);
  const excludeUid = String(request.data?.excludeUid || '');
  const matches = await db.collection('volunteers').where('phoneNumber', '==', phoneNumber).get();
  const duplicate = matches.docs.find((snapshot) => snapshot.id !== excludeUid && snapshot.data().deleted !== true);
  if (duplicate) {
    throw new HttpsError(
      'already-exists',
      'A volunteer with this phone number already exists. Use the existing profile or ask the Owner to resolve the duplicate.'
    );
  }
  return { available: true, phoneNumber };
});

exports.createEventTask = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  await requireAdmin(request);
  const input = request.data || {};
  const title = String(input.title || '').trim();
  const eventId = String(input.eventId || '').trim();
  const eventName = String(input.eventName || '').trim();
  const startMillis = Number(input.startMillis);
  const endMillis = input.endMillis == null ? null : Number(input.endMillis);
  const volunteersNeeded = Math.floor(Number(input.volunteersNeeded));
  const reminderHoursBefore = Array.isArray(input.reminderHoursBefore) ? input.reminderHoursBefore.map(Number) : [];
  if (!title || !eventId || !Number.isFinite(startMillis)) throw new HttpsError('invalid-argument', 'Event, task title, and start time are required.');
  if (startMillis < Date.now() - 60000) throw new HttpsError('invalid-argument', 'Task start date and time cannot be in the past.');
  if (endMillis !== null && (!Number.isFinite(endMillis) || endMillis <= startMillis)) throw new HttpsError('invalid-argument', 'Task end time must be after its start time.');
  if (!Number.isFinite(volunteersNeeded) || volunteersNeeded < 1) throw new HttpsError('invalid-argument', 'At least one volunteer is required.');
  if (!validReminderHours(reminderHoursBefore)) throw new HttpsError('invalid-argument', 'Use up to two positive reminder times at least 24 hours apart.');
  const event = await db.doc(`events/${eventId}`).get();
  if (!event.exists || event.data().deleted === true) throw new HttpsError('not-found', 'The selected event was not found.');

  const normalizedTitle = normalizedTaskTitle(title);
  const existing = await db.collection('tasks').where('eventId', '==', eventId).get();
  const duplicate = existing.docs.find((item) => {
    const data = item.data();
    return data.deleted !== true && normalizedTaskTitle(data.title) === normalizedTitle
      && data.startDateTime?.toMillis?.() === startMillis;
  });
  if (duplicate) throw new HttpsError('already-exists', `This event already has “${title}” at that date and time.`);

  const uniquenessId = createHash('sha256').update(`${eventId}|${normalizedTitle}|${startMillis}`).digest('hex');
  const lockRef = db.doc(`taskUniqueness/${uniquenessId}`);
  const taskRef = db.collection('tasks').doc();
  await db.runTransaction(async (transaction) => {
    const lock = await transaction.get(lockRef);
    if (lock.exists) {
      const linkedId = String(lock.data().taskId || '');
      const linked = linkedId ? await transaction.get(db.doc(`tasks/${linkedId}`)) : null;
      if (linked?.exists && linked.data().deleted !== true) {
        throw new HttpsError('already-exists', `This event already has “${title}” at that date and time.`);
      }
    }
    transaction.set(taskRef, {
      title, description: String(input.description || '').trim(), eventId,
      eventName: eventName || event.data().name || null,
      startDateTime: admin.firestore.Timestamp.fromMillis(startMillis),
      endDateTime: endMillis === null ? null : admin.firestore.Timestamp.fromMillis(endMillis),
      location: String(input.location || '').trim(),
      skillsNeeded: Array.isArray(input.skillsNeeded) ? input.skillsNeeded.map(String) : [],
      volunteersNeeded, assignedVolunteers: [], openForSignup: true, status: 'open',
      recurrence: 'none', seriesId: null, occurrenceIndex: 0, reminderHoursBefore,
      createdBy: request.auth.uid, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.set(lockRef, { taskId: taskRef.id, eventId, normalizedTitle, startMillis, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  return { taskId: taskRef.id };
});

exports.trashTask = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  if (!request.auth || request.auth.token.email_verified !== true) throw new HttpsError('unauthenticated', 'A verified portal account is required.');
  const taskId = String(request.data?.taskId || '').trim();
  const scope = request.data?.scope === 'future' ? 'future' : 'one';
  if (!taskId) throw new HttpsError('invalid-argument', 'Task is required.');
  const selected = await db.doc(`tasks/${taskId}`).get();
  if (!selected.exists) throw new HttpsError('not-found', 'Task was not found.');
  const selectedData = selected.data();
  const adminDoc = await db.doc(`admins/${request.auth.uid}`).get();
  const isAdmin = adminDoc.data()?.isAdmin === true;
  if (!isAdmin && selectedData.createdBy !== request.auth.uid) throw new HttpsError('permission-denied', 'You can move only tasks you created to Trash.');

  let targets = [selected];
  if (scope === 'future' && selectedData.seriesId) {
    const series = await db.collection('tasks').where('seriesId', '==', selectedData.seriesId).get();
    const cutoff = selectedData.startDateTime?.toMillis?.() || 0;
    targets = series.docs.filter((item) => (item.data().startDateTime?.toMillis?.() || 0) >= cutoff);
  }
  targets = targets.filter((item) => item.data().deleted !== true);
  if (!targets.length) throw new HttpsError('failed-precondition', 'This task is already in Trash.');
  const batchId = `${Date.now()}_${taskId}`;
  const deletedFields = {
    deleted: true, deletedAt: admin.firestore.FieldValue.serverTimestamp(), deletedBy: request.auth.uid,
    deletedBatchId: batchId, deletedScope: scope, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (scope === 'future' && selectedData.seriesId) {
    await db.doc(`taskSeries/${selectedData.seriesId}`).set({
      stoppedAt: admin.firestore.FieldValue.serverTimestamp(), deletedBatchId: batchId,
      cutoff: selectedData.startDateTime,
    });
  }
  for (let i = 0; i < targets.length; i += 400) {
    const batch = db.batch();
    targets.slice(i, i + 400).forEach((item) => batch.update(item.ref, deletedFields));
    await batch.commit();
  }
  const verification = await selected.ref.get();
  if (verification.data()?.deleted !== true) throw new HttpsError('internal', 'Task deletion could not be verified.');
  return { batchId, affected: targets.length };
});

exports.beginVolunteerSignup = onCall(
  { region: 'us-central1', maxInstances: 2, secrets: [whatsappAccessToken] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Start signup before checking the phone number.');
    const phoneNumber = normalizePhone(request.data?.phoneNumber);
    const email = String(request.data?.email || '').trim().toLowerCase();
    if (!email || email !== String(request.auth.token.email || '').trim().toLowerCase()) {
      throw new HttpsError('permission-denied', 'Signup email does not match the signed-in account.');
    }

    const matches = await db.collection('volunteers').where('phoneNumber', '==', phoneNumber).get();
    const existing = matches.docs.find((snapshot) => snapshot.id !== request.auth.uid && snapshot.data().deleted !== true);
    if (!existing) return { existingProfile: false };

    const volunteer = existing.data();
    if (volunteer.email) {
      throw new HttpsError('already-exists', 'This phone number is already connected to an activated account. Use login or forgot password.');
    }
    if (volunteer.whatsappOptIn !== true || !volunteer.phoneNumber) {
      throw new HttpsError('failed-precondition', 'This profile cannot receive a secure WhatsApp activation link. Ask the Owner for help.');
    }

    const lastSentAt = volunteer.invitationLastSentAt?.toMillis?.() || 0;
    const recentlySent = Date.now() - lastSentAt < 2 * 60 * 1000;
    if (!recentlySent) {
      const token = randomBytes(32).toString('base64url');
      const hash = tokenHash(token);
      const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + PORTAL_INVITE_TTL_DAYS * 86400000);
      const link = `${PORTAL_URL}?invite=${encodeURIComponent(token)}`;
      let providerId;
      try {
        providerId = await sendPortalTemplate(volunteer.phoneNumber, [volunteer.firstName || volunteer.name || 'Volunteer', link]);
      } catch (error) {
        throw new HttpsError('unavailable', `The secure WhatsApp activation link could not be sent. ${String(error.message || error)}`);
      }

      const previousInvites = await db.collection('portalInvites').where('volunteerId', '==', existing.id).get();
      const batch = db.batch();
      previousInvites.docs.forEach((previous) => {
        if (previous.data().status === 'active') {
          batch.update(previous.ref, { status: 'revoked', revokedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
      });
      batch.set(db.doc(`portalInvites/${hash}`), {
        volunteerId: existing.id, tokenHash: hash, status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt,
        sentBy: request.auth.uid, providerId,
      });
      batch.update(existing.ref, {
        invitationStatus: 'sent', invitationFailureReason: admin.firestore.FieldValue.delete(),
        invitationLastSentAt: admin.firestore.FieldValue.serverTimestamp(), invitationExpiresAt: expiresAt,
        invitationSendCount: admin.firestore.FieldValue.increment(1), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.set(db.collection('sentMessages').doc(), {
        channel: 'whatsapp', type: 'portal_invitation', volunteerId: existing.id,
        destination: volunteer.phoneNumber, templateName: PORTAL_INVITE_TEMPLATE,
        providerId, status: 'accepted', sentAt: admin.firestore.FieldValue.serverTimestamp(),
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await batch.commit();
    }

    await admin.auth().deleteUser(request.auth.uid).catch(() => undefined);
    return { existingProfile: true, inviteSent: !recentlySent, recentlySent };
  }
);

exports.getVolunteerDirectory = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  if (!request.auth || request.auth.token.email_verified !== true) {
    throw new HttpsError('unauthenticated', 'A verified portal account is required.');
  }
  const snapshot = await db.collection('volunteers').get();
  return {
    volunteers: snapshot.docs
      .filter((item) => {
        const data = item.data();
        return data.deleted !== true && data.participationStatus !== 'inactive'
          && data.whatsappOptIn === true && Boolean(data.phoneNumber);
      })
      .map((item) => ({ uid: item.id, name: item.data().name || `${item.data().firstName || ''} ${item.data().lastName || ''}`.trim() || 'Volunteer' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
});

exports.manageVolunteerTaskAssignment = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  if (!request.auth || request.auth.token.email_verified !== true) {
    throw new HttpsError('unauthenticated', 'A verified portal account is required.');
  }
  const taskId = String(request.data?.taskId || '').trim();
  const volunteerId = String(request.data?.volunteerId || '').trim();
  const action = request.data?.action === 'remove' ? 'remove' : 'add';
  if (!taskId || !volunteerId) throw new HttpsError('invalid-argument', 'Task and volunteer are required.');
  const taskRef = db.doc(`tasks/${taskId}`);
  const volunteerRef = db.doc(`volunteers/${volunteerId}`);
  await db.runTransaction(async (transaction) => {
    const [task, volunteer] = await Promise.all([transaction.get(taskRef), transaction.get(volunteerRef)]);
    if (!task.exists) throw new HttpsError('not-found', 'Task was not found.');
    const taskData = task.data();
    const callerAdmin = await db.doc(`admins/${request.auth.uid}`).get();
    if (taskData.createdBy !== request.auth.uid && callerAdmin.data()?.isAdmin !== true) {
      throw new HttpsError('permission-denied', 'Only the task creator or an administrator can manage assignments.');
    }
    if (!volunteer.exists || volunteer.data().deleted === true || volunteer.data().participationStatus === 'inactive'
      || volunteer.data().whatsappOptIn !== true || !volunteer.data().phoneNumber) {
      throw new HttpsError('failed-precondition', 'This volunteer is not active for task assignments.');
    }
    const assigned = Array.isArray(taskData.assignedVolunteers) ? taskData.assignedVolunteers : [];
    if (action === 'add') {
      if (assigned.includes(volunteerId)) return;
      if (assigned.length >= (taskData.volunteersNeeded || 1)) throw new HttpsError('failed-precondition', 'This task is already full.');
      transaction.update(taskRef, { assignedVolunteers: admin.firestore.FieldValue.arrayUnion(volunteerId), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else {
      transaction.update(taskRef, { assignedVolunteers: admin.firestore.FieldValue.arrayRemove(volunteerId), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  });
  return { updated: true };
});

exports.setPortalInviteSending = onCall({ region: 'us-central1', maxInstances: 2 }, async (request) => {
  await requireAdmin(request, true);
  const enabled = request.data?.enabled === true;
  await db.doc('notificationSettings/portalInvitations').set({
    enabled, templateName: PORTAL_INVITE_TEMPLATE, language: PORTAL_INVITE_LANGUAGE,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid,
  }, { merge: true });
  return { enabled };
});

async function sendPortalTemplate(phoneNumber, params) {
  const response = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${whatsappAccessToken.value()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phoneNumber.replace(/^\+/, ''), type: 'template', template: {
      name: PORTAL_INVITE_TEMPLATE, language: { code: PORTAL_INVITE_LANGUAGE },
      components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
    }}),
  });
  const body = await response.json();
  if (!response.ok) {
    const message = body?.error?.message || `Meta returned HTTP ${response.status}`;
    const details = body?.error?.error_data?.details;
    throw new Error(details ? `${message}: ${details}` : message);
  }
  return body.messages?.[0]?.id || '';
}

exports.sendPortalInvites = onCall(
  { region: 'us-central1', maxInstances: 1, secrets: [whatsappAccessToken], timeoutSeconds: 120 },
  async (request) => {
    await requireAdmin(request, true);
    const settings = await db.doc('notificationSettings/portalInvitations').get();
    if (settings.data()?.enabled !== true) {
      throw new HttpsError('failed-precondition', `Sending is disabled until ${PORTAL_INVITE_TEMPLATE} is approved and enabled.`);
    }
    const requestedIds = Array.isArray(request.data?.volunteerIds) ? request.data.volunteerIds.slice(0, 50) : [];
    const snapshots = requestedIds.length
      ? await Promise.all(requestedIds.map((id) => db.doc(`volunteers/${String(id)}`).get()))
      : (await db.collection('volunteers').where('invitationStatus', '==', 'waiting_for_template').limit(50).get()).docs;
    const results = [];
    for (const snapshot of snapshots) {
      if (!snapshot.exists) continue;
      const volunteer = snapshot.data();
      if (volunteer.email || volunteer.deleted === true || volunteer.whatsappOptIn !== true || !volunteer.phoneNumber) continue;
      const token = randomBytes(32).toString('base64url');
      const hash = tokenHash(token);
      const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + PORTAL_INVITE_TTL_DAYS * 86400000);
      const link = `${PORTAL_URL}?invite=${encodeURIComponent(token)}`;
      try {
        // The approved volunteer_portal_invite_v1 body has two variables: name and secure link.
        const providerId = await sendPortalTemplate(volunteer.phoneNumber, [volunteer.firstName || volunteer.name || 'Volunteer', link]);
        const previousInvites = await db.collection('portalInvites').where('volunteerId', '==', snapshot.id).get();
        const inviteRef = db.doc(`portalInvites/${hash}`);
        const messageRef = db.collection('sentMessages').doc();
        const batch = db.batch();
        previousInvites.docs.forEach((previous) => {
          if (previous.data().status === 'active') {
            batch.update(previous.ref, { status: 'revoked', revokedAt: admin.firestore.FieldValue.serverTimestamp() });
          }
        });
        batch.set(inviteRef, { volunteerId: snapshot.id, tokenHash: hash, status: 'active', createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt, sentBy: request.auth.uid, providerId });
        batch.update(snapshot.ref, { invitationStatus: 'sent', invitationFailureReason: admin.firestore.FieldValue.delete(), invitationLastSentAt: admin.firestore.FieldValue.serverTimestamp(), invitationExpiresAt: expiresAt, invitationSendCount: admin.firestore.FieldValue.increment(1), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        batch.set(messageRef, { channel: 'whatsapp', type: 'portal_invitation', volunteerId: snapshot.id, destination: volunteer.phoneNumber, templateName: PORTAL_INVITE_TEMPLATE, providerId, status: 'accepted', sentAt: admin.firestore.FieldValue.serverTimestamp(), acceptedAt: admin.firestore.FieldValue.serverTimestamp() });
        await batch.commit();
        results.push({ volunteerId: snapshot.id, sent: true });
      } catch (error) {
        await snapshot.ref.update({ invitationStatus: 'failed', invitationFailureReason: String(error.message || error), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        results.push({ volunteerId: snapshot.id, sent: false, error: String(error.message || error) });
      }
    }
    return { attempted: results.length, sent: results.filter((item) => item.sent).length, failed: results.filter((item) => !item.sent).length };
  }
);

exports.getPortalInvite = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  const token = String(request.data?.token || '');
  if (token.length < 20) throw new HttpsError('invalid-argument', 'This invitation link is invalid.');
  const invite = await db.doc(`portalInvites/${tokenHash(token)}`).get();
  const data = invite.data();
  if (!invite.exists || data.status !== 'active' || data.expiresAt?.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', 'This invitation link is invalid or expired. Ask the Owner to send a new one.');
  const volunteer = await db.doc(`volunteers/${data.volunteerId}`).get();
  if (!volunteer.exists) throw new HttpsError('not-found', 'Volunteer profile was not found.');
  return { name: volunteer.data().name || volunteer.data().firstName || 'Volunteer', expiresAt: data.expiresAt.toMillis() };
});

exports.claimPortalInvite = onCall({ region: 'us-central1', maxInstances: 2 }, async (request) => {
  const token = String(request.data?.token || '');
  const email = String(request.data?.email || '').trim().toLowerCase();
  const password = String(request.data?.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  if (password.length < 6) throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');
  const inviteRef = db.doc(`portalInvites/${tokenHash(token)}`);
  const invite = await inviteRef.get();
  const data = invite.data();
  if (!invite.exists || data.status !== 'active' || data.expiresAt?.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', 'This invitation link is invalid or expired.');
  const volunteerRef = db.doc(`volunteers/${data.volunteerId}`);
  const volunteer = await volunteerRef.get();
  if (!volunteer.exists || volunteer.data().email) throw new HttpsError('failed-precondition', 'This volunteer profile has already been claimed.');
  try {
    await admin.auth().createUser({ uid: data.volunteerId, email, password, displayName: volunteer.data().name || '' });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'This email is already used by another account.');
    throw new HttpsError('internal', 'The portal account could not be created.');
  }
  const batch = db.batch();
  batch.update(volunteerRef, { email, 'notificationPrefs.email': true, invitationStatus: 'invited', portalRegistrationStatus: 'email_verification_pending', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  batch.update(inviteRef, { status: 'used', usedAt: admin.firestore.FieldValue.serverTimestamp(), claimedEmail: email });
  await batch.commit();
  return { volunteerId: data.volunteerId, email };
});

/** Receive Meta's WhatsApp message-status callbacks and update the original record. */
exports.whatsappStatusWebhook = onRequest(
  { region: 'us-central1', maxInstances: 2, secrets: [whatsappWebhookVerifyToken] },
  async (request, response) => {
    if (request.method === 'GET') {
      const verified = request.query['hub.mode'] === 'subscribe'
        && request.query['hub.verify_token'] === whatsappWebhookVerifyToken.value();
      if (verified && request.query['hub.challenge']) response.status(200).send(String(request.query['hub.challenge']));
      else response.sendStatus(403);
      return;
    }
    if (request.method !== 'POST') {
      response.set('Allow', 'GET, POST').sendStatus(405);
      return;
    }
    try {
      const statuses = [];
      for (const entry of request.body?.entry || []) {
        for (const change of entry.changes || []) {
          for (const status of change.value?.statuses || []) statuses.push(status);
        }
      }
      await Promise.all(statuses.map(async (event) => {
        const providerId = typeof event.id === 'string' ? event.id : '';
        const nextStatus = typeof event.status === 'string' ? event.status.toLowerCase() : '';
        if (!providerId || !['sent', 'delivered', 'read', 'failed'].includes(nextStatus)) return;
        const match = await db.collection('sentMessages').where('providerId', '==', providerId).limit(1).get();
        if (match.empty) return;
        const ref = match.docs[0].ref;
        const occurredAt = /^\d+$/.test(String(event.timestamp || ''))
          ? admin.firestore.Timestamp.fromMillis(Number(event.timestamp) * 1000)
          : admin.firestore.Timestamp.now();
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(ref);
          if (!snapshot.exists || snapshot.data().channel !== 'whatsapp') return;
          const current = snapshot.data().status || 'accepted';
          if (current === 'read' || (current === 'failed' && nextStatus !== 'failed')) return;
          if (nextStatus !== 'failed' && current !== 'failed'
            && (WHATSAPP_STATUS_RANK[nextStatus] || 0) < (WHATSAPP_STATUS_RANK[current] || 0)) return;
          const update = {
            status: nextStatus,
            [`${nextStatus}At`]: occurredAt,
            webhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          if (event.recipient_id) update.recipientId = String(event.recipient_id);
          if (event.conversation?.id) update.conversationId = String(event.conversation.id);
          if (event.pricing?.category) update.billingCategory = String(event.pricing.category);
          if (nextStatus === 'failed') {
            const error = Array.isArray(event.errors) ? event.errors[0] : null;
            update.failureReason = error?.error_data?.details || error?.message || error?.title || 'Meta reported delivery failure';
            if (error?.code !== undefined) update.failureCode = String(error.code);
          }
          transaction.update(ref, update);
        });
      }));
      response.sendStatus(200);
    } catch (error) {
      console.error('WhatsApp status webhook failed', error);
      response.sendStatus(500);
    }
  }
);

exports.deleteVolunteerAccount = onCall({ region: 'us-central1', maxInstances: 2 }, async (request) => {
  if (!request.auth || request.auth.token.email_verified !== true) {
    throw new HttpsError('unauthenticated', 'A verified administrator account is required.');
  }
  const caller = await db.doc(`admins/${request.auth.uid}`).get();
  if (!caller.exists || caller.data().isAdmin !== true) {
    throw new HttpsError('permission-denied', 'Administrator access is required.');
  }
  const uid = typeof request.data?.uid === 'string' ? request.data.uid.trim() : '';
  if (!uid || uid === request.auth.uid) throw new HttpsError('invalid-argument', 'Choose another volunteer account.');
  const targetAdmin = await db.doc(`admins/${uid}`).get();
  if (targetAdmin.exists && targetAdmin.data().isAdmin === true) {
    throw new HttpsError('failed-precondition', 'Remove Admin access before deleting this volunteer account.');
  }

  const volunteerRef = db.doc(`volunteers/${uid}`);
  const volunteer = await volunteerRef.get();
  if (!volunteer.exists) throw new HttpsError('not-found', 'Volunteer profile was not found.');
  const anonymousId = `former_${randomUUID()}`;
  const now = admin.firestore.Timestamp.now();
  const tasks = await db.collection('tasks').where('assignedVolunteers', 'array-contains', uid).get();
  const hourLogs = await db.collection('hourLogs').where('volunteerId', '==', uid).get();
  const feedback = await db.collection('eventFeedback').where('volunteerId', '==', uid).get();
  const writes = [];

  tasks.docs.forEach((item) => {
    const data = item.data();
    const assigned = Array.isArray(data.assignedVolunteers) ? data.assignedVolunteers : [];
    const isPast = data.startDateTime?.toMillis?.() < now.toMillis();
    writes.push({ ref: item.ref, data: {
      assignedVolunteers: assigned.map((id) => id === uid ? (isPast ? anonymousId : null) : id).filter(Boolean),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }});
  });
  hourLogs.docs.forEach((item) => writes.push({ ref: item.ref, data: {
    volunteerId: anonymousId,
    volunteerName: 'Former volunteer',
    volunteerEmail: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }}));
  feedback.docs.forEach((item) => writes.push({ ref: item.ref, data: {
    volunteerId: anonymousId,
    anonymous: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }}));
  writes.push({ ref: volunteerRef, delete: true });

  // Delete authentication first. If later data cleanup fails, the operation is
  // safe to retry because a missing Auth user is accepted on the next attempt.
  try {
    await admin.auth().deleteUser(uid);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw new HttpsError('internal', 'The login account could not be deleted. No profile data was changed.');
  }
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach((write) => write.delete ? batch.delete(write.ref) : batch.update(write.ref, write.data));
    await batch.commit();
  }
  return { deleted: true };
});

// Immutable, server-generated activity ledger. Auth context identifies the
// principal that performed each Firestore write, including future UI paths.
const AUDITED_COLLECTIONS = new Set([
  'admins', 'announcements', 'appValueReports', 'departmentAnnouncements', 'departmentEvents',
  'departmentMemberships', 'departmentTasks', 'departments', 'eventActionItems', 'govindasMenus', 'govindasOrders',
  'costEntries', 'eventFeedback', 'eventMeetings', 'events', 'eventTemplates', 'hourLogs',
  'notificationSettings', 'reminders', 'sentMessages', 'tasks', 'taskSeries', 'volunteers',
]);

const CATEGORY_BY_COLLECTION = {
  admins: 'Administration', announcements: 'Communications', appValueReports: 'Reporting',
  departmentAnnouncements: 'Departments', departmentEvents: 'Departments', departmentMemberships: 'Departments',
  departmentTasks: 'Departments', departments: 'Departments', costEntries: 'Costs',
  govindasMenus: "Govinda's", govindasOrders: "Govinda's",
  eventActionItems: 'Event planning', eventFeedback: 'Feedback', eventMeetings: 'Event planning',
  events: 'Events', eventTemplates: 'Event planning', hourLogs: 'Service hours',
  notificationSettings: 'Notifications', reminders: 'Notifications', sentMessages: 'Notifications', tasks: 'Tasks',
  taskSeries: 'Tasks', volunteers: 'Volunteers',
};

const TYPE_BY_COLLECTION = {
  admins: 'administrator', announcements: 'announcement', appValueReports: 'value report',
  departmentAnnouncements: 'department announcement', departmentEvents: 'department event',
  departmentMemberships: 'department access', departmentTasks: 'department task', departments: 'department', costEntries: 'cost entry',
  govindasMenus: 'Govinda’s menu', govindasOrders: 'Govinda’s order',
  eventActionItems: 'action item', eventFeedback: 'feedback', eventMeetings: 'meeting',
  events: 'event', eventTemplates: 'event template', hourLogs: 'hour log',
  notificationSettings: 'notification setting', reminders: 'reminder', sentMessages: 'message', tasks: 'task',
  taskSeries: 'task series', volunteers: 'volunteer',
};

function changedFields(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
}

function targetLabel(collectionId, documentId, data) {
  if (collectionId === 'volunteers' || collectionId === 'admins') return data.name || data.email || documentId;
  if (collectionId === 'appValueReports') return data.month || documentId;
  if (collectionId === 'sentMessages' || collectionId === 'reminders') return data.channel || TYPE_BY_COLLECTION[collectionId];
  return data.title || data.name || data.eventName || documentId;
}

function describeActivity(collectionId, before, after) {
  const type = TYPE_BY_COLLECTION[collectionId] || collectionId;
  if (!before) return { action: `${type}.created`, verb: 'Created' };
  if (!after) return { action: `${type}.deleted`, verb: 'Permanently deleted' };
  if (before.deleted !== true && after.deleted === true) return { action: `${type}.trashed`, verb: 'Moved to Trash' };
  if (before.deleted === true && after.deleted !== true) return { action: `${type}.restored`, verb: 'Restored' };
  if (collectionId === 'admins' && before.isAdmin === true && after.isAdmin === false) return { action: 'admin.access_removed', verb: 'Removed Admin access from' };
  if (collectionId === 'admins' && before.isAdmin !== true && after.isAdmin === true) return { action: 'admin.access_granted', verb: 'Granted Admin access to' };
  if (collectionId === 'tasks') {
    const oldAssigned = Array.isArray(before.assignedVolunteers) ? before.assignedVolunteers : [];
    const newAssigned = Array.isArray(after.assignedVolunteers) ? after.assignedVolunteers : [];
    if (JSON.stringify(oldAssigned) !== JSON.stringify(newAssigned)) return { action: 'task.assignments_updated', verb: 'Updated volunteer assignments for' };
    if (before.status !== 'cancelled' && after.status === 'cancelled') return { action: 'task.cancelled', verb: 'Cancelled' };
  }
  if (collectionId === 'eventActionItems' && before.status !== after.status) return { action: `action.status_${after.status}`, verb: `Marked action ${after.status}` };
  if (collectionId === 'hourLogs' && !before.checkOut && after.checkOut) return { action: 'hours.checked_out', verb: 'Recorded checkout for' };
  if (collectionId === 'events' && JSON.stringify(before.planningDoc) !== JSON.stringify(after.planningDoc)) return { action: 'event.plan_updated', verb: 'Updated planning document for' };
  if (collectionId === 'sentMessages') return { action: 'notification.status_updated', verb: 'Updated notification delivery for' };
  if (collectionId === 'notificationSettings' && before?.paused !== after?.paused) {
    return after.paused
      ? { action: 'whatsapp.paused', verb: 'Paused' }
      : { action: 'whatsapp.resumed', verb: 'Resumed' };
  }
  return { action: `${type}.updated`, verb: 'Updated' };
}

exports.auditApplicationActivity = onDocumentWrittenWithAuthContext(
  { document: '{collectionId}/{documentId}', region: 'us-central1', maxInstances: 2 },
  async (event) => {
    const { collectionId, documentId } = event.params;
    if (!AUDITED_COLLECTIONS.has(collectionId)) return;
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!before && !after) return;
    const data = after || before;
    const description = describeActivity(collectionId, before, after);
    const actorId = event.authId || data.updatedBy || data.deletedBy || data.createdBy || 'system';
    let email = '';
    let role = event.authType === 'system' ? 'system' : 'volunteer';
    if (actorId && actorId !== 'system') {
      const [userResult, adminResult] = await Promise.allSettled([
        admin.auth().getUser(actorId), db.doc(`admins/${actorId}`).get(),
      ]);
      if (userResult.status === 'fulfilled') email = userResult.value.email || '';
      if (adminResult.status === 'fulfilled' && adminResult.value.exists && adminResult.value.data().isAdmin === true) {
        const adminData = adminResult.value.data();
        role = adminData.role === 'owner' || adminData.bootstrap === true ? 'owner' : 'admin';
      }
    }
    const fields = changedFields(before, after).filter((key) => !['updatedAt', 'createdAt'].includes(key));
    const label = targetLabel(collectionId, documentId, data);
    await db.collection('auditLogs').add({
      event: 'activity', category: CATEGORY_BY_COLLECTION[collectionId] || 'Other',
      action: description.action, summary: `${description.verb} ${TYPE_BY_COLLECTION[collectionId] || collectionId} “${label}”`,
      actorId, email, role, occurredAt: admin.firestore.FieldValue.serverTimestamp(),
      targetType: TYPE_BY_COLLECTION[collectionId] || collectionId, targetId: documentId,
      targetLabel: label, changedFields: fields, source: event.authType || 'unknown',
    });
  }
);
