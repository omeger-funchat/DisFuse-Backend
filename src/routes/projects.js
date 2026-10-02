import { Router } from "express";
import { auth } from "../auth.js";
import {
  db,
  getProject,
  shapeProject,
  createProject,
  touchProject,
  deleteProject,
  countProjects,
  listWorkspaces,
  now,
  uid,
  J,
  P,
} from "../db.js";
import { LIMITS } from "./users.js";

const r = Router();

function canSee(p, me) {
  return p && (p.public || p.ownerId === me);
}

r.post("/", auth, (req, res) => {
  if (countProjects(req.discordUser.id) >= LIMITS.projects) {
    return res.status(403).json({ error: "project limit reached" });
  }
  const p = createProject(req.discordUser.id, req.body || {});
  res.json({ data: p, project: p });
});

r.get("/insights", auth, (req, res) => {
  res.json({ insights: [], data: [] });
});

r.get("/:id", auth, (req, res) => {
  const p = getProject(req.params.id);
  if (!canSee(p, req.discordUser.id)) return res.status(404).json({ error: "not found" });
  res.json({ ...p, data: p });
});

r.put("/:id", auth, (req, res) => {
  const p = getProject(req.params.id);
  if (!p || p.ownerId !== req.discordUser.id) return res.status(404).json({ error: "not found" });
  const b = req.body || {};
  db.prepare("UPDATE projects SET name = ?, description = ?, public = ?, updatedAt = ? WHERE id = ?").run(
    b.name ?? p.name,
    b.description ?? p.description,
    b.public ?? b.visibility ?? p.public ? 1 : 0,
    now(),
    p._id,
  );
  touchProject(p._id);
  const out = getProject(p._id);
  res.json({ data: out, project: out });
});

r.patch("/:id", auth, (req, res) => {
  req.url = req.url;
  r.handle({ ...req, method: "PUT" }, res);
});

r.delete("/:id", auth, (req, res) => {
  const p = getProject(req.params.id);
  if (!p || p.ownerId !== req.discordUser.id) return res.status(404).json({ error: "not found" });
  deleteProject(p._id);
  res.json({ ok: true });
});

r.post("/:id/clones", auth, (req, res) => {
  const src = getProject(req.params.id);
  if (!canSee(src, req.discordUser.id)) return res.status(404).json({ error: "not found" });
  if (countProjects(req.discordUser.id) >= LIMITS.projects) {
    return res.status(403).json({ error: "project limit reached" });
  }
  const copy = createProject(req.discordUser.id, {
    name: (src.name || "Untitled") + " (clone)",
    description: src.description,
    workspaces: src.workspaces,
  });
  res.json({ data: copy, project: copy });
});

function toggle(id, me, table) {
  const row = db.prepare(`SELECT likes FROM ${table} WHERE id = ?`).get(id);
  if (!row) return null;
  const likes = new Set(P(row.likes, []));
  if (likes.has(me)) likes.delete(me);
  else likes.add(me);
  db.prepare(`UPDATE ${table} SET likes = ? WHERE id = ?`).run(J([...likes]), id);
  return [...likes];
}

r.post("/:id/likes", auth, (req, res) => {
  const likes = toggle(req.params.id, req.discordUser.id, "projects");
  if (!likes) return res.status(404).json({ error: "not found" });
  res.json({ likes, data: likes });
});

r.post("/:id/workspaces", auth, (req, res) => {
  const p = getProject(req.params.id);
  if (!p || p.ownerId !== req.discordUser.id) return res.status(404).json({ error: "not found" });
  const id = uid();
  db.prepare("INSERT INTO workspaces (id, projectId, name, data, updatedAt) VALUES (?, ?, ?, ?, ?)").run(
    id,
    p._id,
    req.body?.name || "untitled",
    req.body?.data || "",
    now(),
  );
  touchProject(p._id);
  res.json({ data: { _id: id, id, name: req.body?.name || "untitled" } });
});

r.patch("/:id/workspaces/:wsId/data", auth, (req, res) => {
  const p = getProject(req.params.id);
  if (!p || p.ownerId !== req.discordUser.id) return res.status(404).json({ error: "not found" });
  db.prepare("UPDATE workspaces SET data = ?, updatedAt = ? WHERE id = ? AND projectId = ?").run(
    req.body?.data ?? "",
    now(),
    req.params.wsId,
    p._id,
  );
  touchProject(p._id);
  res.json({ ok: true, data: { ok: true } });
});

r.get("/:id/versions", auth, (req, res) => {
  const p = getProject(req.params.id);
  if (!canSee(p, req.discordUser.id)) return res.status(404).json({ error: "not found" });
  const versions = db
    .prepare("SELECT id, name, createdAt FROM versions WHERE projectId = ? ORDER BY createdAt DESC")
    .all(p._id);
  const body = {
    versioned: !!p.versioned,
    versions,
    canManage: p.ownerId === req.discordUser.id,
    canEdit: p.ownerId === req.discordUser.id,
    premium: true,
    maxVersions: LIMITS.versionsPerProject,
    premiumMaxVersions: LIMITS.versionsPerProject,
  };
  res.json({ ...body, data: body });
});

r.get("/:id/versions/:versionId", auth, (req, res) => {
  const v = db.prepare("SELECT * FROM versions WHERE id = ? AND projectId = ?").get(req.params.versionId, req.params.id);
  if (!v) return res.status(404).json({ error: "not found" });
  res.json({ _id: v.id, name: v.name, workspaces: P(v.snapshot, []), createdAt: v.createdAt });
});

r.post("/:id/versions", auth, (req, res) => {
  const p = getProject(req.params.id);
  if (!p || p.ownerId !== req.discordUser.id) return res.status(404).json({ error: "not found" });
  const count = db.prepare("SELECT COUNT(*) c FROM versions WHERE projectId = ?").get(p._id).c;
  if (count >= LIMITS.versionsPerProject) {
    return res.status(403).json({ error: "version limit reached" });
  }
  const id = uid();
  db.prepare("INSERT INTO versions (id, projectId, name, snapshot, createdAt) VALUES (?, ?, ?, ?, ?)").run(
    id,
    p._id,
    req.body?.name || `Version ${count + 1}`,
    J(req.body?.workspaces || p.workspaces),
    now(),
  );
  if (!p.versioned) db.prepare("UPDATE projects SET versioned = 1 WHERE id = ?").run(p._id);
  res.json({ data: { _id: id, id } });
});

r.patch("/:id/versions/:versionId", auth, (req, res) => {
  db.prepare("UPDATE versions SET name = ? WHERE id = ? AND projectId = ?").run(
    req.body?.name || "Version",
    req.params.versionId,
    req.params.id,
  );
  res.json({ ok: true });
});

r.delete("/:id/versions/:versionId", auth, (req, res) => {
  db.prepare("DELETE FROM versions WHERE id = ? AND projectId = ?").run(req.params.versionId, req.params.id);
  res.json({ ok: true });
});

r.delete("/:id/insights/logs", auth, (req, res) => {
  res.json({ ok: true });
});

export default r;
