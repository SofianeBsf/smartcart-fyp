import "dotenv/config";
import express from "express";
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { COOKIE_NAME, SESSION_EXPIRY_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import * as db from "../db";
import { nanoid } from "nanoid";
import { sendVerificationEmail, sendPasswordResetEmail, sendPurchaseConfirmationEmail, sendAccountDeletionEmail } from "../emailService";
import crypto, { randomBytes } from "crypto";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

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
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  // ── Security headers ──
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production'
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],  // needed for Tailwind/shadcn
            imgSrc: ["'self'", "data:", "https:"],     // product images from external CDNs
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
        }
      : false,  // disabled in dev for Vite HMR
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }));

  // ── CORS — only allow our own origin ──
  const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
    : [];
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // ── Rate limiting ──
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,       // 15-minute window
    max: 5,                           // 5 attempts (down from 20)
    message: { error: 'Too many attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,     // only count failed attempts
  });

  const generalApiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,        // 1-minute window
    max: 100,                         // 100 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/auth/reset-password', authLimiter);
  app.use('/api/auth/change-password', authLimiter);
  app.use('/api/auth/resend-verification', authLimiter);
  app.use('/api/', generalApiLimiter);

  // --- Local dev login (ONLY available in explicit development mode) ---
  if (process.env.NODE_ENV === 'development') {
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
          expiresInMs: SESSION_EXPIRY_MS,
        });

        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_EXPIRY_MS });

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
          expiresInMs: SESSION_EXPIRY_MS,
        });

        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_EXPIRY_MS });

        const redirectParam = String(req.query.redirect ?? "/admin");
        const safeRedirect = redirectParam.startsWith("/") ? redirectParam : "/admin";
        return res.redirect(safeRedirect);
      } catch (e) {
        console.error("[DevLogin] GET failed", e);
        return res.status(500).send("dev-login failed");
      }
    });
  } else {
    app.all("/api/auth/dev-login", (_req, res) => {
      return res.status(404).json({ error: "Not found" });
    });
  }

  // ==================== AUTH ENDPOINTS ====================

  // Register endpoint — creates user + sends verification email
  app.post("/api/auth/register", async (req, res) => {
    try {
      if (!bcrypt) {
        return res.status(500).json({ error: "Server auth not ready. Try again later." });
      }

      const { name, email, password } = req.body;

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
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
      if (!passwordRegex.test(password)) {
        return res.status(400).json({ error: "Password must contain at least one uppercase letter, one lowercase letter, and one number" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const existingUser = await db.getUserByEmail(normalizedEmail);
      if (existingUser) {
        // Send a "someone tried to register" email to existing user, but return same 201 to caller
        return res.status(201).json({ message: "If this email is valid, a verification link has been sent." });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const verificationToken = randomBytes(32).toString("hex");
      const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

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
        return res.status(503).json({ error: "Registration requires a running database" });
      }

      // Save verification token
      await db.setVerificationToken(userId, verificationToken, verificationTokenExpires);

      // Send verification email in the background — don't block registration
      sendVerificationEmail(normalizedEmail, name.trim(), verificationToken)
        .then(result => {
          if (!result.success) console.warn("[Register] Verification email failed:", result.error);
          else console.log("[Register] Verification email sent to", normalizedEmail);
        })
        .catch(err => console.warn("[Register] Email error:", err));

      return res.status(201).json({
        success: true,
        message: "Account created! Please check your email to verify your account.",
        userId,
      });
    } catch (e) {
      console.error("[Register] failed", e);
      return res.status(500).json({ error: "Registration failed" });
    }
  });

  // Verify email endpoint
  app.get("/api/auth/verify-email", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) {
        return res.status(400).json({ error: "Verification token is required" });
      }

      const user = await db.getUserByVerificationToken(token);
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired verification link" });
      }

      if (user.verificationTokenExpires && new Date(user.verificationTokenExpires) < new Date()) {
        return res.status(400).json({ error: "Verification link has expired. Please request a new one." });
      }

      await db.verifyUserEmail(user.id);

      return res.json({ success: true, message: "Email verified successfully" });
    } catch (e) {
      console.error("[VerifyEmail] failed", e);
      return res.status(500).json({ error: "Email verification failed" });
    }
  });

  // Resend verification email
  app.post("/api/auth/resend-verification", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const user = await db.getUserByEmail(email.trim().toLowerCase());
      if (!user || user.emailVerified) {
        // Don't reveal whether user exists
        return res.json({ success: true, message: "If an unverified account exists, a new email has been sent." });
      }

      const verificationToken = randomBytes(32).toString("hex");
      const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.setVerificationToken(user.id, verificationToken, verificationTokenExpires);
      await sendVerificationEmail(user.email!, user.name || "User", verificationToken);

      return res.json({ success: true, message: "Verification email resent." });
    } catch (e) {
      console.error("[ResendVerification] failed", e);
      return res.status(500).json({ error: "Failed to resend verification email" });
    }
  });

  // Login endpoint — requires verified email
  app.post("/api/auth/login", async (req, res) => {
    try {
      if (!bcrypt) {
        return res.status(500).json({ error: "Server auth not ready. Try again later." });
      }

      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const user = await db.getUserByEmail(normalizedEmail);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        console.warn(`[Auth] Failed login attempt for: ${normalizedEmail} from IP: ${req.ip}`);
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Check email verification
      if (!user.emailVerified) {
        return res.status(403).json({
          error: "Please verify your email before logging in",
          needsVerification: true,
        });
      }

      // Detect first login: lastSignedIn ≈ createdAt means user has never
      // actually logged in (both are set on registration).
      const isFirstLogin =
        user.createdAt &&
        user.lastSignedIn &&
        Math.abs(user.lastSignedIn.getTime() - user.createdAt.getTime()) < 60_000; // within 1 min

      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: SESSION_EXPIRY_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_EXPIRY_MS });

      return res.json({
        success: true,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        isFirstLogin: !!isFirstLogin,
      });
    } catch (e) {
      console.error("[Login] failed", e);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  // Forgot password — sends reset email
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const user = await db.getUserByEmail(normalizedEmail);

      if (user) {
        const resetToken = randomBytes(32).toString("hex");
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await db.setPasswordResetToken(user.id, resetToken, resetExpires);
        await sendPasswordResetEmail(normalizedEmail, user.name || "User", resetToken);
      }

      // Always return success (prevent email enumeration)
      return res.json({
        success: true,
        message: "If an account exists with that email, you will receive a password reset link.",
      });
    } catch (e) {
      console.error("[ForgotPassword] failed", e);
      return res.status(500).json({ error: "Forgot password request failed" });
    }
  });

  // Reset password — validates token and updates password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      if (!bcrypt) {
        return res.status(500).json({ error: "Server auth not ready" });
      }

      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ error: "Token and new password are required" });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
      if (!passwordRegex.test(password)) {
        return res.status(400).json({ error: "Password must contain at least one uppercase letter, one lowercase letter, and one number" });
      }

      const user = await db.getUserByPasswordResetToken(token);
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset link" });
      }

      if (user.passwordResetExpires && new Date(user.passwordResetExpires) < new Date()) {
        return res.status(400).json({ error: "Reset link has expired. Please request a new one." });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      await db.resetUserPassword(user.id, passwordHash);

      return res.json({ success: true, message: "Password reset successfully" });
    } catch (e) {
      console.error("[ResetPassword] failed", e);
      return res.status(500).json({ error: "Password reset failed" });
    }
  });

  // ── Diagnostic: test email (Resend) — DEV ONLY ──
  // Completely disabled in production to prevent credential leakage and email relay abuse.
  if (process.env.NODE_ENV === 'development') {
    app.get("/api/auth/test-email", async (req, res) => {
      const resendKey = process.env.RESEND_API_KEY;
      const resendFrom = process.env.RESEND_FROM_EMAIL;
      const toParam = typeof req.query.to === "string" ? req.query.to : undefined;

      if (!resendKey) {
        return res.json({ success: false, error: "No email provider configured" });
      }

      try {
        const recipient = toParam || "test@example.com";
        const fromAddress = resendFrom || "Pick N Take Test <onboarding@resend.dev>";
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: fromAddress,
            to: [recipient],
            subject: "Pick N Take Email Test - " + new Date().toISOString(),
            html: "<p>If you see this, Resend email is working!</p>",
          }),
        });
        const data = await r.json().catch(() => ({}));
        return res.json({
          success: r.ok,
          messageId: data.id,
          sentTo: recipient,
          status: r.status,
        });
      } catch (err: any) {
        return res.json({ success: false, error: err.message || String(err) });
      }
    });
  } else {
    app.all("/api/auth/test-email", (_req, res) => res.status(404).json({ error: "Not found" }));
  }

  // ==================== DELETE ACCOUNT ENDPOINTS ====================

  // Request account deletion — sends confirmation email
  app.post("/api/auth/request-delete-account", async (req, res) => {
    try {
      if (!bcrypt) {
        return res.status(500).json({ error: "Server auth not ready. Try again later." });
      }

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

      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: "Password is required" });
      }

      if (!user.passwordHash) {
        return res.status(400).json({ error: "Account does not use password authentication" });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Incorrect password" });
      }

      // Create HMAC-signed deletion token
      const hmacSecret = process.env.JWT_SECRET;
      if (!hmacSecret) { return res.status(500).json({ error: "Server configuration error" }); }
      const expiresAt = Date.now() + 3600000; // 1 hour
      const hmac = crypto
        .createHmac("sha256", hmacSecret)
        .update(`delete:${user.id}:${expiresAt}`)
        .digest("hex");
      const token = `${user.id}:${expiresAt}:${hmac}`;

      // Send confirmation email
      await sendAccountDeletionEmail(user.email!, user.name || "User", token);

      return res.json({ success: true, message: "Confirmation email sent" });
    } catch (e) {
      console.error("[RequestDeleteAccount] failed", e);
      return res.status(500).json({ error: "Failed to request account deletion" });
    }
  });

  // Confirm account deletion — verifies token and deletes user
  app.get("/api/auth/confirm-delete-account", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }

      const parts = token.split(":");
      if (parts.length !== 3) {
        return res.status(400).json({ error: "Invalid token format" });
      }

      const [userIdStr, expiresAtStr, providedHmac] = parts;
      const userId = parseInt(userIdStr, 10);
      const expiresAt = parseInt(expiresAtStr, 10);

      if (isNaN(userId) || isNaN(expiresAt)) {
        return res.status(400).json({ error: "Invalid token" });
      }

      // Check expiry
      if (Date.now() > expiresAt) {
        return res.status(400).json({ error: "Token has expired" });
      }

      // Verify HMAC
      const hmacSecret = process.env.JWT_SECRET;
      if (!hmacSecret) { return res.status(500).json({ error: "Server configuration error" }); }
      const expectedHmac = crypto
        .createHmac("sha256", hmacSecret)
        .update(`delete:${userId}:${expiresAt}`)
        .digest("hex");

      const isHmacValid = crypto.timingSafeEqual(Buffer.from(providedHmac, 'hex'), Buffer.from(expectedHmac, 'hex'));
      if (!isHmacValid) {
        return res.status(400).json({ error: "Invalid token" });
      }

      // Delete user from DB
      const dbInstance = await db.getDb();
      if (!dbInstance) return res.status(500).json({ error: "Database not available" });
      await dbInstance.delete(users).where(eq(users.id, userId));

      // Clear session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.clearCookie(COOKIE_NAME, cookieOptions);

      // Redirect to homepage with deleted flag
      return res.redirect(302, "/?deleted=1");
    } catch (e) {
      console.error("[ConfirmDeleteAccount] failed", e);
      return res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // Purchase confirmation email endpoint
  app.post("/api/auth/send-purchase-email", async (req, res) => {
    try {
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
      if (!user || !user.email) {
        return res.status(401).json({ error: "User not found" });
      }

      const { orderId, items, total } = req.body;
      await sendPurchaseConfirmationEmail(user.email, user.name || "Customer", {
        orderId,
        items,
        total,
      });

      return res.json({ success: true });
    } catch (e) {
      console.error("[PurchaseEmail] failed", e);
      return res.status(500).json({ error: "Failed to send confirmation email" });
    }
  });



  // Update user profile (name)
  app.put("/api/auth/profile", async (req, res) => {
    try {
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

      const { name } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Name is required" });
      }

      await db.upsertUser({
        openId: user.openId,
        name: name.trim(),
        lastSignedIn: new Date(),
      });

      return res.json({ success: true, message: "Profile updated successfully" });
    } catch (e) {
      console.error("[Profile] update failed", e);
      return res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Change password
  app.post("/api/auth/change-password", async (req, res) => {
    try {
      await loadBcrypt;
      if (!bcrypt) {
        return res.status(500).json({ error: "Password hashing not available" });
      }

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

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current and new passwords are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters" });
      }

      // Verify current password
      if (user.passwordHash) {
        const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValid) {
          return res.status(400).json({ error: "Current password is incorrect" });
        }
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await db.resetUserPassword(user.id, newHash);

      return res.json({ success: true, message: "Password changed successfully" });
    } catch (e) {
      console.error("[ChangePassword] failed", e);
      return res.status(500).json({ error: "Failed to change password" });
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

    // Eagerly preload the embedding model so the first search is fast
    import("../aiService").then(ai => ai.preloadModel()).catch(() => {});
  });
}

startServer().catch(console.error);
