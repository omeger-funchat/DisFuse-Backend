import { Router } from "express";
import { auth } from "../auth.js";
import { db, now, uid, J, P } from "../db.js";

const r = Router();

function shape(t) {
  return {
    _id: t.id,
    id: t.id,
    owner: t.ownerId,
    ownerId: t.ownerId,
    name: t.name,
    description: t.description,
    visibility: t.visibility,
    likes: P(t.likes, []),
    imports: t.imports,
    draft: P(t.draft, {}),
    published: t.published ? P(t.published, null) : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

r.get("/", auth, (req, res) => {
  const { filter, sort, q, page = 1, limit = 20 } = req.query;
  let sql = "SELECT * FROM templates";
  const conds = [];
  if (filter === "mine") conds.push(`ownerId = '${req.discordUser.id.replace(/'/g, "")}'`);
  else conds.push("visibility = 'public'");
  if (q) conds.push(`(name LIKE '%${String(q).replace(/'/g, "")}%' OR description LIKE '%${String(q).replace(/'/g, "")}%')`);
  sql += " WHERE " + conds.join(" AND ");
  sql += sort === "newest" ? " ORDER BY createdAt DESC" : " ORDER BY imports DESC, createdAt DESC";
  const all = db.prepare(sql).all();
  const pg = Math.max(1, Number(page) || 1);
  const lim = Math.min(100, Number(limit) || 20);
  const slice = all.slice((pg - 1) * lim, pg * lim).map(shape);
  res.json({ templates: slice, total: all.length, page: pg, pages: Math.ceil(all.length / lim), data: slice });
});

r.post("/", auth, (req, res) => {
  const id = uid();
  const t = now();
  db.prepare(
    "INSERT INTO templates (id, ownerId, name, description, visibility, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, req.discordUser.id, req.body?.name || "Untitled template", req.body?.description || "", req.body?.visibility || "public", t, t);
  const out = shape(db.prepare("SELECT * FROM templates WHERE id = ?").get(id));
  res.json({ data: out, template: out });
});

r.get("/:id", auth, (req, res) => {
  const t = db.prepare("SELECT * FROM templates WHERE id = ?").get(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  if (t.visibility !== "public" && t.ownerId !== req.discordUser.id) {
    return res.status(404).json({ error: "not found" });
  }
  res.json({ ...shape(t), data: shape(t) });
});

r.patch("/:id", auth, (req, res) => {
  const t = db.prepare("SELECT * FROM templates WHERE id = ?").get(req.params.id);
  if (!t || t.ownerId !== req.discordUser.id) return res.status(404).json({ error: "not found" });
  const b = req.body || {};
  db.prepare("UPDATE templates SET name = ?, description = ?, visibility = ?, updatedAt = ? WHERE id = ?").run(
    b.name ?? t.name,
    b.description ?? t.description,
    b.visibility ?? t.visibility,
    now(),
    t.id,
  );
  const out = shape(db.prepare("SELECT * FROM templates WHERE id = ?").get(t.id));
  res.json({ data: out });
});

r.put("/:id/draft", auth, (req, res) => {
  const t = db.prepare("SELECT * FROM templates WHERE id = ?").get(req.params.id);
  if (!t || t.ownerId !== req.discordUser.id) return res.status(404).json({ error: "not found" });
  db.prepare("UPDATE templates SET draft = ?, updatedAt = ? WHERE id = ?").run(J(req.body || {}), now(), t.id);
  res.json({ ok: true });
});

r.post("/:id/publish", auth, (req, res) => {
  const t = db.prepare("SELECT * FROM templates WHERE id = ?").get(req.params.id);
  if (!t || t.ownerId !== req.discordUser.id) return res.status(404).json({ error: "not found" });
  db.prepare("UPDATE templates SET published = ?, updatedAt = ? WHERE id = ?").run(t.draft, now(), t.id);
  res.json({ ok: true });
});

r.delete("/:id/publish", auth, (req, res) => {
  db.prepare("UPDATE templates SET published = NULL WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

r.delete("/:id", auth, (req, res) => {
  db.prepare("DELETE FROM templates WHERE id = ? AND ownerId = ?").run(req.params.id, req.discordUser.id);
  res.json({ ok: true });
});

r.patch("/:id/likes", auth, (req, res) => {
  const t = db.prepare("SELECT likes FROM templates WHERE id = ?").get(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  const likes = new Set(P(t.likes, []));
  if (likes.has(req.discordUser.id)) likes.delete(req.discordUser.id);
  else likes.add(req.discordUser.id);
  db.prepare("UPDATE templates SET likes = ? WHERE id = ?").run(J([...likes]), req.params.id);
  res.json({ likes: [...likes], data: [...likes] });
});

r.post("/:id/imports", auth, (req, res) => {
  db.prepare("UPDATE templates SET imports = imports + 1 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

r.post("/:id/packs/install", auth, (req, res) => {
  res.json({ ok: true, data: [] });
});

export default r;
