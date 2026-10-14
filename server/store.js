const fs = require("node:fs");
const path = require("node:path");
const { getApps, initializeApp, cert } = require("firebase-admin/app");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");

class JsonStore {
  constructor(directory) {
    this.directory = directory;
    this.files = {
      events: path.join(directory, "events.json"),
      transactions: path.join(directory, "finance.json"),
      dates: path.join(directory, "blocked-dates.json"),
      logins: path.join(directory, "login-attempts.json"),
      publicAttempts: path.join(directory, "public-attempts.json"),
      sessions: path.join(directory, "sessions.json"),
    };
  }
  read(key, fallback) {
    try { return JSON.parse(fs.readFileSync(this.files[key], "utf8")); }
    catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
  }
  write(key, value) {
    fs.mkdirSync(this.directory, { recursive: true });
    const filename = this.files[key];
    const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, filename);
  }
  async getDates() { const value = this.read("dates", []); return Array.isArray(value) ? value : []; }
  async setDates(dates) { this.write("dates", dates); }
  async getEvents() { const value = this.read("events", []); return Array.isArray(value) ? value : []; }
  async getEvent(id) { return (await this.getEvents()).find((item) => item.id === id) || null; }
  async createEvent(event) { const items = await this.getEvents(); items.unshift(event); this.write("events", items); }
  async updateEvent(id, event) { const items = await this.getEvents(); const index = items.findIndex((item) => item.id === id); if (index < 0) return false; items[index] = event; this.write("events", items); return true; }
  async deleteEvent(id) { const items = await this.getEvents(); const next = items.filter((item) => item.id !== id); if (next.length === items.length) return false; this.write("events", next); return true; }
  async getTransactions() { const value = this.read("transactions", []); return Array.isArray(value) ? value : []; }
  async getTransaction(id) { return (await this.getTransactions()).find((item) => item.id === id) || null; }
  async createTransaction(item) { const items = await this.getTransactions(); items.unshift(item); this.write("transactions", items); }
  async updateTransaction(id, item) { const items = await this.getTransactions(); const index = items.findIndex((entry) => entry.id === id); if (index < 0) return false; items[index] = item; this.write("transactions", items); return true; }
  async deleteTransaction(id) { const items = await this.getTransactions(); const next = items.filter((item) => item.id !== id); if (next.length === items.length) return false; this.write("transactions", next); return true; }
  async allowLoginAttempt(key, now, windowMs, maxAttempts) {
    const attempts = this.read("logins", {});
    const recent = (attempts[key] || []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= maxAttempts) { attempts[key] = recent; this.write("logins", attempts); return false; }
    recent.push(now); attempts[key] = recent;
    for (const [entry, values] of Object.entries(attempts)) if (!values.some((timestamp) => now - timestamp < windowMs)) delete attempts[entry];
    this.write("logins", attempts);
    return true;
  }
  async allowPublicSubmission(key, now, windowMs, maxAttempts) {
    const attempts = this.read("publicAttempts", {});
    const recent = (attempts[key] || []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= maxAttempts) { attempts[key] = recent; this.write("publicAttempts", attempts); return false; }
    recent.push(now); attempts[key] = recent;
    for (const [entry, values] of Object.entries(attempts)) if (!values.some((timestamp) => now - timestamp < windowMs)) delete attempts[entry];
    this.write("publicAttempts", attempts);
    return true;
  }
  async clearLoginAttempts(key) { const attempts = this.read("logins", {}); delete attempts[key]; this.write("logins", attempts); }
  async createSession(id, expiresAt) {
    const sessions = this.read("sessions", {});
    for (const [sessionId, expiration] of Object.entries(sessions)) if (Number(expiration) <= Date.now()) delete sessions[sessionId];
    sessions[id] = expiresAt;
    this.write("sessions", sessions);
  }
  async hasSession(id) { const sessions = this.read("sessions", {}); return Number(sessions[id]) > Date.now(); }
  async revokeSession(id) { const sessions = this.read("sessions", {}); delete sessions[id]; this.write("sessions", sessions); }
}

class FirestoreStore {
  constructor(db, prefix) { this.db = db; this.prefix = prefix; }
  collection(name) { return this.db.collection(`${this.prefix}_${name}`); }
  async getDates() {
    const snapshot = await this.collection("appData").doc("availability").get();
    const dates = snapshot.exists ? snapshot.get("dates") : [];
    return Array.isArray(dates) ? dates : [];
  }
  async setDates(dates) { await this.collection("appData").doc("availability").set({ dates, updatedAt: FieldValue.serverTimestamp() }); }
  async getEvents() {
    const snapshot = await this.collection("events").get();
    return snapshot.docs.map((document) => ({ ...document.data(), id: document.id }));
  }
  async getEvent(id) { const snapshot = await this.collection("events").doc(id).get(); return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null; }
  async createEvent(event) { const { id, ...data } = event; await this.collection("events").doc(id).set(data); }
  async updateEvent(id, event) { const { id: ignored, ...data } = event; const reference = this.collection("events").doc(id); const snapshot = await reference.get(); if (!snapshot.exists) return false; await reference.update(data); return true; }
  async deleteEvent(id) { const reference = this.collection("events").doc(id); const snapshot = await reference.get(); if (!snapshot.exists) return false; await reference.delete(); return true; }
  async getTransactions() {
    const snapshot = await this.collection("finance").get();
    return snapshot.docs.map((document) => ({ ...document.data(), id: document.id }));
  }
  async getTransaction(id) { const snapshot = await this.collection("finance").doc(id).get(); return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null; }
  async createTransaction(item) { const { id, ...data } = item; await this.collection("finance").doc(id).set(data); }
  async updateTransaction(id, item) { const { id: ignored, ...data } = item; const reference = this.collection("finance").doc(id); const snapshot = await reference.get(); if (!snapshot.exists) return false; await reference.update(data); return true; }
  async deleteTransaction(id) { const reference = this.collection("finance").doc(id); const snapshot = await reference.get(); if (!snapshot.exists) return false; await reference.delete(); return true; }
  async allowLoginAttempt(key, now, windowMs, maxAttempts) {
    const reference = this.collection("security").doc("loginAttempts").collection("byAddress").doc(key);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const attempts = snapshot.exists ? snapshot.get("attempts") : [];
      const recent = (Array.isArray(attempts) ? attempts : []).filter((timestamp) => now - timestamp < windowMs);
      if (recent.length >= maxAttempts) return false;
      recent.push(now);
      transaction.set(reference, { attempts: recent, expiresAt: Timestamp.fromMillis(now + windowMs * 2) });
      return true;
    });
  }
  async allowPublicSubmission(key, now, windowMs, maxAttempts) {
    const reference = this.collection("security").doc("publicSubmissions").collection("byAddress").doc(key);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const attempts = snapshot.exists ? snapshot.get("attempts") : [];
      const recent = (Array.isArray(attempts) ? attempts : []).filter((timestamp) => now - timestamp < windowMs);
      if (recent.length >= maxAttempts) return false;
      recent.push(now);
      transaction.set(reference, { attempts: recent, expiresAt: Timestamp.fromMillis(now + windowMs * 2) });
      return true;
    });
  }
  async clearLoginAttempts(key) { await this.collection("security").doc("loginAttempts").collection("byAddress").doc(key).delete(); }
  async createSession(id, expiresAt) { await this.collection("sessions").doc(id).set({ expiresAt: Timestamp.fromMillis(expiresAt) }); }
  async hasSession(id) {
    const snapshot = await this.collection("sessions").doc(id).get();
    return snapshot.exists && snapshot.get("expiresAt").toMillis() > Date.now();
  }
  async revokeSession(id) { await this.collection("sessions").doc(id).delete(); }
}

function createStore() {
  const credential = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!credential) {
    if (process.env.VERCEL || process.env.NODE_ENV === "production") throw new Error("FIREBASE_SERVICE_ACCOUNT must be configured in the hosting environment.");
    return new JsonStore(path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data")));
  }
  let serviceAccount;
  try { serviceAccount = JSON.parse(credential); }
  catch { throw new Error("FIREBASE_SERVICE_ACCOUNT must contain valid service-account JSON."); }
  if (serviceAccount.private_key) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;
  if (!projectId || !serviceAccount.client_email || !serviceAccount.private_key) throw new Error("Firebase service-account JSON must include project_id, client_email, and private_key.");
  const prefix = process.env.FIREBASE_COLLECTION_PREFIX || "duda";
  if (!/^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(prefix)) throw new Error("FIREBASE_COLLECTION_PREFIX must start with a letter and contain only letters, numbers, and underscores (max 31 characters).");
  const app = getApps()[0] || initializeApp({ credential: cert({ ...serviceAccount, projectId }), projectId });
  return new FirestoreStore(getFirestore(app), prefix);
}

module.exports = { createStore };
