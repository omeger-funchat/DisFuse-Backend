import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

const db = new Database(process.env.DB_PATH || "./data.sqlite");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  avatar TEXT,
  banned INTEGER DEFAULT 0,
  staff INTEGER DEFAULT 0,
  settings TEXT DEFAULT '{}',
  favorites TEXT DEFAULT '[]',
  blocked TEXT DEFAULT '[]',
  createdAt INTEGER
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  ownerId TEXT,
  name TEXT,
  description TEXT DEFAULT '',
  public INTEGER DEFAULT 1,
  likes TEXT DEFAULT '[]',
  versioned INTEGER DEFAULT 0,
  createdAt INTEGER,
  updatedAt INTEGER
);
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  projectId TEXT,
  name TEXT,
  data TEXT DEFAULT '',
  updatedAt INTEGER
);
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  projectId TEXT,
  name TEXT,
  snapshot TEXT DEFAULT '[]',
  createdAt INTEGER
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  targetType TEXT,
  targetId TEXT,
  parentId TEXT DEFAULT NULL,
  authorId TEXT,
  text TEXT DEFAULT '',
  likes TEXT DEFAULT '[]',
  createdAt INTEGER
);
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  ownerId TEXT,
  name TEXT,
  description TEXT DEFAULT '',
  visibility TEXT DEFAULT 'public',
  likes TEXT DEFAULT '[]',
  imports INTEGER DEFAULT 0,
  draft TEXT DEFAULT '{}',
  published TEXT DEFAULT NULL,
  createdAt INTEGER,
  updatedAt INTEGER
);
CREATE TABLE IF NOT EXISTS packs (
  id TEXT PRIMARY KEY,
  ownerId TEXT,
  name TEXT,
  description TEXT DEFAULT '',
  data TEXT DEFAULT '{}',
  blocks TEXT DEFAULT '[]',
  likes TEXT DEFAULT '[]',
  createdAt INTEGER,
  updatedAt INTEGER
);
CREATE TABLE IF NOT EXISTS websites (
  id TEXT PRIMARY KEY,
  ownerId TEXT,
  botID TEXT DEFAULT '',
  name TEXT,
  config TEXT DEFAULT '{}',
  projectId TEXT DEFAULT NULL,
  published INTEGER DEFAULT 0,
  path TEXT DEFAULT NULL,
  dashboardAccess TEXT DEFAULT '{}',
  createdAt INTEGER,
  updatedAt INTEGER
);
CREATE TABLE IF NOT EXISTS inbox (
  id TEXT PRIMARY KEY,
  userId TEXT,
  payload TEXT DEFAULT '{}',
  read INTEGER DEFAULT 0,
  createdAt INTEGER
);
`);

export const now = () => Date.now();
export const uid = () => randomUUID();
const J = (v) => JSON.stringify(v ?? null);
const P = (v, fb) => {
  try {
    const r = JSON.parse(v);
    return r ?? fb;
  } catch {
    return fb;
  }
};

export function getUser(id) {
  const r = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!r) return null;
  return shapeUser(r);
}

export function shapeUser(r) {
  return {
    id: r.id,
    username: r.username,
    avatar: r.avatar,
    banned: !!r.banned,
    staff: !!r.staff,
    settings: P(r.settings, {}),
    favorites: P(r.favorites, []),
    blocked: P(r.blocked, []),
    createdAt: r.createdAt,
  };
}

export function upsertUser({ id, username, avatar }) {
  const ex = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (ex) {
    db.prepare("UPDATE users SET username = ?, avatar = ? WHERE id = ?").run(
      username || null,
      avatar || null,
      id,
    );
  } else {
    db.prepare(
      "INSERT INTO users (id, username, avatar, createdAt) VALUES (?, ?, ?, ?)",
    ).run(id, username || null, avatar || null, now());
  }
  return getUser(id);
}

export function updateUser(id, patch) {
  const u = getUser(id);
  if (!u) return null;
  const next = { ...u, ...patch, id };
  db.prepare(
    "UPDATE users SET username = ?, avatar = ?, banned = ?, staff = ?, settings = ?, favorites = ?, blocked = ? WHERE id = ?",
  ).run(
    next.username || null,
    next.avatar || null,
    next.banned ? 1 : 0,
    next.staff ? 1 : 0,
    J(next.settings),
    J(next.favorites),
    J(next.blocked),
    id,
  );
  return getUser(id);
}

export function listUsers() {
  return db.prepare("SELECT * FROM users ORDER BY createdAt DESC").all().map(shapeUser);
}

export function shapeProject(r) {
  return {
    _id: r.id,
    id: r.id,
    ownerId: r.ownerId,
    owner: r.ownerId,
    name: r.name,
    description: r.description,
    public: !!r.public,
    likes: P(r.likes, []),
    versioned: !!r.versioned,
    workspaces: listWorkspaces(r.id),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function getProject(id) {
  const r = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  return r ? shapeProject(r) : null;
}

export function listWorkspaces(projectId) {
  return db
    .prepare("SELECT * FROM workspaces WHERE projectId = ? ORDER BY rowid")
    .all(projectId)
    .map((w) => ({
      _id: w.id,
      id: w.id,
      projectId: w.projectId,
      name: w.name,
      data: w.data,
      updatedAt: w.updatedAt,
    }));
}

export function countProjects(ownerId) {
  return db
    .prepare("SELECT COUNT(*) c FROM projects WHERE ownerId = ?")
    .get(ownerId).c;
}

export function createProject(ownerId, { name, description, workspaces }) {
  const id = uid();
  const t = now();
  db.prepare(
    "INSERT INTO projects (id, ownerId, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, ownerId, name || "Untitled project", description || "", t, t);
  const ws = workspaces?.length
    ? workspaces
    : [{ name: "main", data: "" }];
  for (const w of ws) {
    db.prepare(
      "INSERT INTO workspaces (id, projectId, name, data, updatedAt) VALUES (?, ?, ?, ?, ?)",
    ).run(uid(), id, w.name || "main", w.data || "", t);
  }
  return getProject(id);
}

export function touchProject(id) {
  db.prepare("UPDATE projects SET updatedAt = ? WHERE id = ?").run(now(), id);
}

export function deleteProject(id) {
  db.prepare("DELETE FROM workspaces WHERE projectId = ?").run(id);
  db.prepare("DELETE FROM versions WHERE projectId = ?").run(id);
  db.prepare("DELETE FROM comments WHERE targetId = ?").run(id);
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
}

export { db, J, P };
