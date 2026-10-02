import { Router } from "express";
import { auth } from "../auth.js";
import { db, now, uid, J, P } from "../db.js";

const r = Router();

function shape(c) {
  return {
    _id: c.id,
    id: c.id,
    authorId: c.authorId,
    author: c.authorId,
    text: c.text,
    likes: P(c.likes, []),
    replies: db
      .prepare("SELECT * FROM comments WHERE parentId = ? ORDER BY createdAt")
      .all(c.id)
      .map((x) => ({
        _id: x.id,
        id: x.id,
        authorId: x.authorId,
        text: x.text,
        likes: P(x.likes, []),
        createdAt: x.createdAt,
      })),
    createdAt: c.createdAt,
  };
}

function list(targetType, targetId) {
  return db
    .prepare("SELECT * FROM comments WHERE targetType = ? AND targetId = ? AND parentId IS NULL ORDER BY createdAt DESC")
    .all(targetType, targetId)
    .map(shape);
}

function create(targetType, targetId, authorId, text, parentId = null) {
  const id = uid();
  db.prepare(
    "INSERT INTO comments (id, targetType, targetId, parentId, authorId, text, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, targetType, targetId, parentId, authorId, text || "", now());
  return shape(db.prepare("SELECT * FROM comments WHERE id = ?").get(id));
}

function toggleLikes(commentId, me) {
  const row = db.prepare("SELECT * FROM comments WHERE id = ?").get(commentId);
  if (!row) return null;
  const likes = new Set(P(row.likes, []));
  if (likes.has(me)) likes.delete(me);
  else likes.add(me);
  db.prepare("UPDATE comments SET likes = ? WHERE id = ?").run(J([...likes]), commentId);
  return shape(db.prepare("SELECT * FROM comments WHERE id = ?").get(commentId));
}

const viaTemplates = (req) => req.params.id !== undefined;

r.get("/", auth, (req, res) => {
  if (!viaTemplates(req)) return res.status(404).json({ error: "not found" });
  const comments = list("template", req.params.id);
  res.json({ comments, data: comments });
});

r.post("/", auth, (req, res) => {
  if (!viaTemplates(req)) return res.status(404).json({ error: "not found" });
  const out = create("template", req.params.id, req.discordUser.id, req.body?.text);
  res.json({ data: out, comment: out });
});

r.get("/:targetId", auth, (req, res) => {
  if (viaTemplates(req)) return res.status(404).json({ error: "not found" });
  const comments = list(req.query.type || "project", req.params.targetId);
  res.json({ comments, data: comments });
});

r.post("/:targetId", auth, (req, res) => {
  if (viaTemplates(req)) return res.status(404).json({ error: "not found" });
  const out = create(req.body?.type || "project", req.params.targetId, req.discordUser.id, req.body?.text, req.body?.parentId || null);
  res.json({ data: out, comment: out });
});

function likeHandler(req, res) {
  const out = toggleLikes(req.params.commentId || req.params.targetId, req.discordUser.id);
  if (!out) return res.status(404).json({ error: "not found" });
  res.json({ ...out, likes: out.likes, data: out });
}

r.patch("/:targetId/likes", auth, likeHandler);
r.post("/:targetId/likes", auth, likeHandler);
r.patch("/:targetId/:commentId/likes", auth, likeHandler);

function replyHandler(req, res) {
  const parent = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.commentId || req.params.targetId);
  if (!parent) return res.status(404).json({ error: "not found" });
  const out = create(parent.targetType, parent.targetId, req.discordUser.id, req.body?.text, parent.id);
  res.json({ data: out, reply: out });
}

r.post("/:targetId/replies", auth, replyHandler);
r.post("/:targetId/:commentId/replies", auth, replyHandler);

r.patch("/:targetId/replies/:replyId/likes", auth, (req, res) => {
  const out = toggleLikes(req.params.replyId, req.discordUser.id);
  if (!out) return res.status(404).json({ error: "not found" });
  res.json({ ...out, data: out });
});

r.delete("/:targetId", auth, (req, res) => {
  db.prepare("DELETE FROM comments WHERE parentId = ?").run(req.params.targetId);
  db.prepare("DELETE FROM comments WHERE id = ? AND authorId = ?").run(req.params.targetId, req.discordUser.id);
  res.json({ ok: true });
});

export default r;
