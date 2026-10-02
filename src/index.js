import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";

import { auth as restAuth } from "./auth.js";
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

io.of("/control").on("connection", (socket) => {
  socket.emit("unsupported", {
    message: "Live control needs a bot runner, which this server does not have yet.",
  });
  socket.on("disconnect", () => {});
});

server.listen(PORT, () => {
  console.log(`DisFuse-Backend on :${PORT}, CORS: ${ORIGIN}`);
});
