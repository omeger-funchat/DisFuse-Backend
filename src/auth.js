import { getUser, upsertUser } from "./db.js";

const cache = new Map();
const TTL = 10 * 60 * 1000;

export async function verifyToken(header) {
  if (!header) {
    const e = new Error("missing token");
    e.status = 401;
    throw e;
  }
  const me = await discordMe(header);
  const avatar = me.avatar
    ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png`
    : null;
  const user = upsertUser({
    id: me.id,
    username: me.global_name || me.username,
    avatar,
  });
  if (user.banned) {
    const e = new Error("banned");
    e.status = 403;
    throw e;
  }
  return user;
}

async function discordMe(token) {
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < TTL) return hit.user;
  const r = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: token },
  });
  if (!r.ok) {
    const e = new Error("discord auth failed");
    e.status = r.status === 401 ? 401 : 403;
    throw e;
  }
  const user = await r.json();
  cache.set(token, { at: Date.now(), user });
  return user;
}

export async function auth(req, res, next) {
  try {
    const token = req.headers.authorization || req.headers.Authorization;
    if (!token) return res.status(401).json({ error: "missing token" });
    const me = await discordMe(token);
    const avatar = me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png`
      : null;
    req.discordUser = upsertUser({
      id: me.id,
      username: me.global_name || me.username,
      avatar,
    });
    if (req.discordUser.banned) {
      return res.status(403).json({ error: "banned" });
    }
    next();
  } catch (e) {
    res.status(e.status || 401).json({ error: "unauthorized" });
  }
}

export function admin(req, res, next) {
  const ids = (process.env.ADMIN_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (req.discordUser.staff || ids.includes(req.discordUser.id)) return next();
  res.status(403).json({ error: "staff only" });
}
