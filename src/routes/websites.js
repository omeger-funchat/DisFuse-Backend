import { Router } from "express";
import { auth } from "../auth.js";
import { db, now, uid, J, P } from "../db.js";
import { LIMITS } from "./users.js";

const r = Router();

function shape(w) {
  return {
    _id: w.id,
    id: w.id,
    ownerId: w.ownerId,
    owner: w.ownerId,
    botID: w.botID,
    name: w.name,
    config: P(w.config, {}),
    projectId: w.projectId,
    published: !!w.published,
    path: w.path,
    url: w.path ? undefined : undefined,
    dashboardAccess: P(w.dashboardAccess, {}),
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

r.get("/", auth, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM websites WHERE ownerId = ? ORDER BY updatedAt DESC")
    .all(req.discordUser.id)
    .map(shape);
  res.json({ websites: rows, data: rows });
});

r.get("/path-available", auth, (req, res) => {
  const path = req.query.path;
  if (!path) return res.json({ available: false });
  const taken = db.prepare("SELECT id FROM websites WHERE path = ?").get(path);
  res.json({ available: !taken, data: !taken });
});

r.get("/permissions", auth, (req, res) => {
  const perms = [
    "ViewChannel",
    "SendMessages",
    "ManageMessages",
    "EmbedLinks",
    "AttachFiles",
    "ReadMessageHistory",
    "AddReactions",
    "ManageRoles",
    "ManageChannels",
    "KickMembers",
    "BanMembers",
    "ManageGuild",
  ];
  res.json({ permissions: perms, data: perms });
});

r.get("/:id", auth, (req, res) => {
  const w = db.prepare("SELECT * FROM websites WHERE id = ?").get(req.params.id);
  if (!w || w.ownerId !== req.discordUser.id) return res.status(404).json({ error: "not found" });
  const out = shape(w);
  res.json({ ...out, data: out });
});

r.post("/", auth, (req, res) => {
  const count = db.prepare("SELECT COUNT(*) c FROM websites WHERE ownerId = ?").get(req.discordUser.id).c;
  if (count >= LIMITS.websites) {
    return res.status(403).json({ error: "website limit reached" });
  }
  const b = req.body || {};
  const id = uid();
  const t = now();
  db.prepare(
    "INSERT INTO websites (id, ownerId, botID, name, config, projectId, published, path, dashboardAccess, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    req.discordUser.id,
    b.botID || "",
    b.name || "Untitled website",
    J(b.config || {}),
    b.projectId || null,
    b.published ? 1 : 0,
    b.path || null,
    J(b.dashboardAccess || {}),
    t,
    t,
  );
  const out = shape(db.prepare("SELECT * FROM websites WHERE id = ?").get(id));
  res.json({ data: out, website: out });
});

r.patch("/:id", auth, (req, res) => {
  const w = db.prepare("SELECT * FROM websites WHERE id = ?").get(req.params.id);
  if (!w || w.ownerId !== req.discordUser.id) return res.status(404).json({ error: "not found" });
  const b = req.body || {};
  db.prepare(
    "UPDATE websites SET botID = ?, name = ?, config = ?, projectId = ?, published = ?, path = ?, dashboardAccess = ?, updatedAt = ? WHERE id = ?",
  ).run(
    b.botID ?? w.botID,
    b.name ?? w.name,
    J(b.config ?? P(w.config, {})),
    b.projectId ?? w.projectId,
    b.published ?? !!w.published ? 1 : 0,
    b.path ?? w.path,
    J(b.dashboardAccess ?? P(w.dashboardAccess, {})),
    now(),
    w.id,
  );
  const out = shape(db.prepare("SELECT * FROM websites WHERE id = ?").get(w.id));
  res.json({ data: out, website: out });
});

r.delete("/:id", auth, (req, res) => {
  db.prepare("DELETE FROM websites WHERE id = ? AND ownerId = ?").run(req.params.id, req.discordUser.id);
  res.json({ ok: true });
});

export default r;
