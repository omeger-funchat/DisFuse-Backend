import { Router } from "express";
import { auth, admin } from "../auth.js";
import {
  db,
  getUser,
  updateUser,
  shapeProject,
  countProjects,
  P,
  J,
  now,
  uid,
} from "../db.js";

export const PREMIUM_PLAN = { id: "premium", name: "Premium" };
export const LIMITS = {
  projects: 30,
  websites: 30,
  versionsPerProject: 25,
  insightsRetentionDays: 90,
};

const r = Router();

r.post("/", auth, (req, res) => {
  res.json({ data: req.discordUser });
});

r.get("/staff", auth, (req, res) => {
  const users = db
    .prepare("SELECT * FROM users WHERE staff = 1")
    .all()
    .map((u) => ({ id: u.id, username: u.username, avatar: u.avatar }));
  res.json({ users });
});

r.get("/", auth, (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  let users = db
    .prepare("SELECT * FROM users ORDER BY createdAt DESC LIMIT 50")
    .all()
    .map((u) => ({ id: u.id, username: u.username, avatar: u.avatar }));
  if (q) users = users.filter((u) => (u.username || "").toLowerCase().includes(q));
  res.json({ users, data: users });
});

r.get("/:id", auth, (req, res) => {
  const u = getUser(req.params.id);
  if (!u) return res.status(404).json({ error: "not found" });
  res.json({ ...u, data: u });
});

r.get("/:id/projects", auth, (req, res) => {
  const mine = req.discordUser.id === req.params.id;
  const rows = db
    .prepare("SELECT * FROM projects WHERE ownerId = ? ORDER BY updatedAt DESC")
    .all(req.params.id);
  const projects = rows
    .map(shapeProject)
    .filter((p) => mine || p.public);
  res.json({ projects, data: projects });
});

r.get("/:id/limits", auth, (req, res) => {
  const projects = countProjects(req.params.id);
  const websites = db
    .prepare("SELECT COUNT(*) c FROM websites WHERE ownerId = ?")
    .get(req.params.id).c;
  const body = {
    premium: true,
    plan: PREMIUM_PLAN,
    limits: LIMITS,
    free: { projects: 5, websites: 5, versionsPerProject: 3, insightsRetentionDays: 7 },
    premiumLimits: LIMITS,
    usage: { projects, websites },
  };
  res.json({ ...body, data: body });
});

r.get("/:id/premium", auth, (req, res) => {
  res.json({ premium: true, plan: PREMIUM_PLAN, data: { premium: true } });
});

r.post("/:id/premium/refresh", auth, (req, res) => {
  res.json({ premium: true, plan: PREMIUM_PLAN });
});

r.post("/:id/premium/checkout", auth, (req, res) => {
  res.json({ url: null, alreadyPremium: true });
});

r.post("/:id/premium/portal", auth, (req, res) => {
  res.json({ url: null });
});

r.post("/:id/premium/cancel", auth, (req, res) => {
  res.json({ premium: true, plan: PREMIUM_PLAN });
});

function selfOnly(req, res, next) {
  if (req.discordUser.id !== req.params.id) {
    return res.status(403).json({ error: "not yours" });
  }
  next();
}

r.put("/:id/settings", auth, selfOnly, (req, res) => {
  const u = getUser(req.params.id);
  const settings = { ...u.settings, ...(req.body || {}) };
  res.json({ data: updateUser(req.params.id, { settings }) });
});

r.put("/:id", auth, selfOnly, (req, res) => {
  const u = getUser(req.params.id);
  const body = req.body || {};
  res.json({
    data: updateUser(req.params.id, {
      settings: { ...u.settings, ...(body.settings || {}) },
      favorites: body.favorites ?? u.favorites,
      blocked: body.blocked ?? u.blocked,
    }),
  });
});

r.post("/:id/favorites", auth, (req, res) => {
  const me = getUser(req.discordUser.id);
  const favs = new Set(me.favorites);
  const target = req.body?.projectId || req.body?.id;
  if (!target) return res.status(400).json({ error: "projectId required" });
  if (favs.has(target)) favs.delete(target);
  else favs.add(target);
  res.json({ data: updateUser(me.id, { favorites: [...favs] }).favorites });
});

r.post("/:id/block", auth, (req, res) => {
  const me = getUser(req.discordUser.id);
  const blocked = new Set(me.blocked);
  const target = req.body?.userId || req.params.id;
  if (blocked.has(target)) blocked.delete(target);
  else blocked.add(target);
  res.json({ data: updateUser(me.id, { blocked: [...blocked] }).blocked });
});

r.get("/:id/inbox", auth, selfOnly, (req, res) => {
  const items = db
    .prepare("SELECT * FROM inbox WHERE userId = ? ORDER BY createdAt DESC LIMIT 100")
    .all(req.params.id)
    .map((m) => ({ _id: m.id, id: m.id, payload: P(m.payload, {}), read: !!m.read, createdAt: m.createdAt }));
  res.json({ inbox: items, data: items });
});

r.put("/:id/inbox", auth, (req, res) => {
  const { messageId, read } = req.body || {};
  if (messageId) {
    db.prepare("UPDATE inbox SET read = ? WHERE id = ? AND userId = ?").run(
      read === false ? 0 : 1,
      messageId,
      req.params.id,
    );
  } else {
    db.prepare("UPDATE inbox SET read = 1 WHERE userId = ?").run(req.params.id);
  }
  res.json({ ok: true });
});

r.get("/:id/blockPacks", auth, (req, res) => {
  const packs = db
    .prepare("SELECT * FROM packs WHERE ownerId = ? ORDER BY updatedAt DESC")
    .all(req.params.id)
    .map(shapePack);
  res.json({ packs, data: packs });
});

function shapePack(p) {
  return {
    _id: p.id,
    id: p.id,
    owner: p.ownerId,
    ownerId: p.ownerId,
    name: p.name,
    description: p.description,
    data: P(p.data, {}),
    blocks: P(p.blocks, []),
    likes: P(p.likes, []),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function packShape(p) {
  return shapePack(p);
}

r.put("/:id/ban", auth, admin, (req, res) => {
  const u = getUser(req.params.id);
  if (!u) return res.status(404).json({ error: "not found" });
  res.json({ data: updateUser(req.params.id, { banned: !(req.body?.unban ?? false) && (req.body?.banned ?? true) }) });
});

r.post("/tosChangeWarning", auth, admin, (req, res) => {
  const users = db.prepare("SELECT * FROM users").all();
  for (const u of users) {
    db.prepare("INSERT INTO inbox (id, userId, payload, createdAt) VALUES (?, ?, ?, ?)").run(
      uid(),
      u.id,
      J({ type: "tos", text: req.body?.text || "Terms updated" }),
      now(),
    );
  }
  res.json({ ok: true, sent: users.length });
});

export default r;
