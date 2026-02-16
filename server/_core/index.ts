import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import * as db from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // --- Local dev login ---
  app.post("/api/auth/dev-login", async (req, res) => {
    try {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      if (!email) return res.status(400).json({ error: "email is required" });

      // Use OWNER_OPEN_ID as the admin openId so you get admin permissions locally
      const openId = process.env.OWNER_OPEN_ID || "dev-admin";
      const name = email.split("@")[0] || "dev-user";

      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: "dev",
        role: "admin",
        lastSignedIn: new Date(),
      });

      const user = await db.getUserByOpenId(openId);
      if (!user) {
        return res.status(503).json({
          error: "dev-login requires a running database (start smartcart-postgres)",
        });
      }

      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      return res.json({ openId, name, email });
    } catch (e) {
      console.error("[DevLogin] failed", e);
      return res.status(500).json({ error: "dev-login failed" });
    }
  });

  // Browser-friendly login (clickable URL)
  app.get("/api/auth/dev-login", async (req, res) => {
    try {
      const email = String(req.query.email ?? "admin@local").trim().toLowerCase();
      const name = String(req.query.name ?? "Dev Admin").trim();
      const openId = process.env.OWNER_OPEN_ID || "dev-admin";

      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: "dev",
        role: "admin",
        lastSignedIn: new Date(),
      });

      const user = await db.getUserByOpenId(openId);
      if (!user) {
        return res.status(503).json({
          error: "dev-login requires a running database (start smartcart-postgres)",
        });
      }

      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      const redirectParam = String(req.query.redirect ?? "/admin");
      const safeRedirect = redirectParam.startsWith("/") ? redirectParam : "/admin";
      return res.redirect(safeRedirect);
    } catch (e) {
      console.error("[DevLogin] GET failed", e);
      return res.status(500).send("dev-login failed");
    }
  });



  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
