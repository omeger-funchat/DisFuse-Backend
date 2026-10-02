import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";

import { auth as restAuth, verifyToken } from "./auth.js";
import { db } from "./db.js;
import usersRouter from "./routes/users.js";
import projectsRouter from "./routes/projects.js";
import commentsRouter from "./routes/comments.js";
import templatesRouter from "./routes/templates.js";
import workshopRouter from "./routes/workshop.js";
import websitesRouter from "./routes/websites.js";
import miscRouter from "./routes/misc.js";

const ORIGIN = process.env.CORS_ORIGIN || "https://omeger-funchat.github.io";
const PORT = Number(process.env.PORT || 7860);

const app = express();
app.use(cors({ origin: ORIGIN.split(",").map((s) => s.trim()) }));
app.use(express.json({ limit: "25mb" }));

app.get("/", (req, res) => res.send("DisFuse API"));
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/stats", (req, res) => {
  const users = db.prepare("SELECT COUNT(*) c FROM users").get().c;
  const projects = db.prepare("SELECT COUNT(*) c FROM projects").get().c;
  const templates = db.prepare("SELECT COUNT(*) c FROM templates").get().c;
  res.json({ users, projects, templates, data: { users, projects, templates } });
});

app.use("/users", restAuth, usersRouter);
app.use("/projects", restAuth, projectsRouter);
app.use("/comments", restAuth, commentsRouter);
app.use("/templates/:id/comments", restAuth, commentsRouter);
app.use("/templates", restAuth, templatesRouter);
app.use("/workshop", restAuth, workshopRouter);
app.use("/websites", restAuth, websitesRouter);
app.use("/", restAuth, miscRouter);

app.use((req, res) => res.status(404).json({ error: "not found" }));

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: ORIGIN.split(",").map((s) => s.trim()) },
});

io.of("/control").use(async (socket, next) => {
  try {
    socket.user = await verifyToken(socket.handshake.auth?.token);
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.of("/control").on("connection", (socket) => {
  socket.on("control:join", ({ projectId } = {}, ack) => {
    const answer = (payload) => {
      if (typeof ack === "function") ack(payload);
      else socket.emit("control:status", payload);
    };
    const row = db.prepare("SELECT ownerId FROM projects WHERE id = ?").get(projectId);
    if (!row) {
      return answer({ ok: false, error: "Couldn't open Control for this bot." });
    }
    if (row.ownerId !== socket.user.id) {
      return answer({ ok: false, error: "Only the bot owner can control it." });
    }
    answer({
      ok: false,
      error: "Live bot control needs a bot runner, which this server does not have yet.",
      reason: "no-runner",
    });
  });

  socket.on("controlAction", (params, ack) => {
    const answer = { ok: false, error: "Live bot control needs a bot runner.", unsupported: true };
    if (typeof ack === "function") ack(answer);
  });

  socket.on("disconnect", () => {});
});

server.listen(PORT, () => {
  console.log(`DisFuse-Backend on :${PORT}, CORS: ${ORIGIN}`);
});
