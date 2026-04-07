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
import { nanoid } from "nanoid";

// bcryptjs for password hashing - loaded dynamically
let bcrypt: any = null;
const loadBcrypt = import("bcryptjs")
  .then((mod) => {
    bcrypt = mod.default || mod;
    console.log("[Auth] bcryptjs loaded successfully");
  })
  .catch(() => {
    console.warn("[Auth] bcryptjs not installed. Install with: npm install bcryptjs");
  });

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
  // Wait for bcryptjs to load before starting
  await loadBcrypt;

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

  // Register endpoint
  app.post("/api/auth/register", async (req, res) => {
    try {
      if (!bcrypt) {
        return res.status(500).json({
          error: "bcryptjs not available. Install with: npm install bcryptjs",
        });
      }

      const { name, email, password } = req.body;

      // Validation
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Name is required" });
      }

      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      if (!password || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({
          error: "Password must be at least 8 characters long",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Check if user already exists
      const existingUser = await db.getUserByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const openId = `user-${nanoid()}`;
      const userId = await db.createUser({
        openId,
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        loginMethod: "password",
        role: "user",
        lastSignedIn: new Date(),
      });

      if (!userId) {
        return res.status(503).json({
          error: "Registration requires a running database",
        });
      }

      return res.status(201).json({
        success: true,
        message: "Registration successful",
      });
    } catch (e) {
      console.error("[Register] failed", e);
      return res.status(500).json({ error: "Registration failed" });
    }
  });

  // Login endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      if (!bcrypt) {
        return res.status(500).json({
          error: "bcryptjs not available. Install with: npm install bcryptjs",
        });
      }

      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Find user by email
      const user = await db.getUserByEmail(normalizedEmail);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Update last signed in
      await db.upsertUser({
        openId: user.openId,
        lastSignedIn: new Date(),
      });

      // Create session token
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      return res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (e) {
      console.error("[Login] failed", e);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  // Forgot password endpoint (simulation - no actual email sent)
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Always return success for security (prevent email enumeration)
      return res.json({
        success: true,
        message: "If an account exists, you will receive a reset link",
      });
    } catch (e) {
      console.error("[ForgotPassword] failed", e);
      return res.status(500).json({ error: "Forgot password request failed" });
    }
  });

  // Upload avatar endpoint
  app.post("/api/auth/upload-avatar", async (req, res) => {
    try {
      // Get authenticated user from cookie
      const cookies = req.headers.cookie || "";
      const cookieMap = new Map(
        cookies.split("; ").map((c) => {
          const [key, ...rest] = c.split("=");
          return [key, rest.join("=")];
        })
      );

      const sessionToken = cookieMap.get(COOKIE_NAME);
      if (!sessionToken) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const session = await sdk.verifySession(sessionToken);
      if (!session) {
        return res.status(401).json({ error: "Invalid session" });
      }

      const user = await db.getUserByOpenId(session.openId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      // For now, return a mock response
      // In production, you would handle file upload with multer and save to S3 or local storage
      const avatarUrl = `/uploads/avatars/${nanoid()}.jpg`;

      await db.updateUserAvatar(user.id, avatarUrl);

      return res.json({
        success: true,
        avatarUrl,
      });
    } catch (e) {
      console.error("[UploadAvatar] failed", e);
      return res.status(500).json({ error: "Avatar upload failed" });
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
