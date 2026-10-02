import { Router } from "express";
import { auth } from "../auth.js";
import { db, now, uid, J, P } from "../db.js";
import { packShape } from "./users.js";

const r = Router();

r.get("/", auth, (req, res) => {
  const packs = db
    .prepare("SELECT * FROM packs ORDER BY updatedAt DESC LIMIT 100")
    .all()
    .map(packShape);
  res.json({ packs, data: packs });
});

r.post("/", auth, (req, res) => {
  const id = uid();
  const t = now();
  db.prepare(
    "INSERT INTO packs (id, ownerId, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, req.discordUser.id, req.body?.name || "Untitled pack", req.body?.description || "", t, t);
  const out = packShape(db.prepare("SELECT * FROM packs WHERE id = ?").get(id));
  res.json({ data: out, pack: out });
});

r.get("/:id", auth, (req, res) => {
  const p = db.prepare("SELECT * FROM packs WHERE id = ?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  const out = packShape(p);
  res.json({ ...out, data: out });
});

function ownPack(req, res, next) {
  const p = db.prepare("SELECT * FROM packs WHERE id = ?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  if (p.ownerId !== req.discordUser.id) return res.status(403).json({ error: "not yours" });
  req.pack = p;
  next();
}

r.patch("/:id/data", auth, ownPack, (req, res) => {
  db.prepare("UPDATE packs SET data = ?, updatedAt = ? WHERE id = ?").run(J(req.body || {}), now(), req.pack.id);
  res.json({ ok: true });
});

r.patch("/:id/blocks", auth, ownPack, (req, res) => {
  db.prepare("UPDATE packs SET blocks = ?, updatedAt = ? WHERE id = ?").run(
    J(req.body?.blocks ?? req.body ?? []),
    now(),
    req.pack.id,
  );
  res.json({ ok: true });
});

r.post("/:id/likes", auth, (req, res) => {
  const p = db.prepare("SELECT likes FROM packs WHERE id = ?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  const likes = new Set(P(p.likes, []));
  if (likes.has(req.discordUser.id)) likes.delete(req.discordUser.id);
  else likes.add(req.discordUser.id);
  db.prepare("UPDATE packs SET likes = ? WHERE id = ?").run(J([...likes]), req.params.id);
  res.json({ likes: [...likes], data: [...likes] });
});

r.get("/:id/users", auth, (req, res) => {
  res.json({ users: [], data: [] });
});

r.delete("/:id", auth, ownPack, (req, res) => {
  db.prepare("DELETE FROM packs WHERE id = ?").run(req.pack.id);
  res.json({ ok: true });
});

export default r;
