import { Router } from "express";
import { auth } from "../auth.js";
import { db, shapeProject } from "../db.js";

const r = Router();

r.get("/control/bots", auth, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM projects WHERE ownerId = ? ORDER BY updatedAt DESC")
    .all(req.discordUser.id)
    .map(shapeProject);
  const bots = rows.map((p) => ({ ...p, online: false, status: "offline" }));
  res.json({ bots, data: bots });
});

r.get("/control/unsupported", auth, (req, res) => {
  const body = {
    message: "Live bot control needs a bot runner, which this server does not have yet.",
  };
  res.json({ ...body, data: body });
});

export default r;
