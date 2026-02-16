import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isString = (value: unknown): value is string => typeof value === "string";

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

class SDKServer {
  private warnedAboutFallbackSecret = false;

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    if (!ENV.cookieSecret) {
      if (ENV.isProduction) {
        throw new Error(
          "JWT_SECRET is missing. Set JWT_SECRET in your .env to enable sessions."
        );
      }

      if (!this.warnedAboutFallbackSecret) {
        console.warn(
          "[Auth] JWT_SECRET is missing. Using a local development fallback secret; sessions will reset when the server restarts."
        );
        this.warnedAboutFallbackSecret = true;
      }

      return new TextEncoder().encode("dev-only-fallback-jwt-secret");
    }

    return new TextEncoder().encode(ENV.cookieSecret);
  }

  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || "",
      },
      { expiresInMs: options.expiresInMs }
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(this.getSessionSecret());
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<SessionPayload | null> {
    if (!cookieValue) return null;

    try {
      const { payload } = await jwtVerify(cookieValue, this.getSessionSecret(), {
        algorithms: ["HS256"],
      });

      const { openId, appId, name } = payload as Record<string, unknown>;

      if (!isNonEmptyString(openId) || !isNonEmptyString(name) || !isString(appId)) {
        return null;
      }

      // Optional safety check: make sure token belongs to this app
      if (ENV.appId && appId !== ENV.appId) {
        return null;
      }

      return { openId, appId, name };
    } catch {
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    let user = await db.getUserByOpenId(session.openId);

    // Local development convenience: bootstrap/update owner account as admin.
    if (!user && !ENV.isProduction) {
      await db.upsertUser({
        openId: session.openId,
        name: session.name,
        loginMethod: "dev",
        role: session.openId === ENV.ownerOpenId ? "admin" : "user",
        lastSignedIn: new Date(),
      });
      user = await db.getUserByOpenId(session.openId);
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    const shouldPromoteOwner = !ENV.isProduction && Boolean(ENV.ownerOpenId) && user.openId === ENV.ownerOpenId;

    if (shouldPromoteOwner && user.role !== "admin") {
      await db.upsertUser({
        openId: user.openId,
        role: "admin",
        lastSignedIn: new Date(),
      });

      return {
        ...user,
        role: "admin",
      };
    }

    return user;
  }

}

export const sdk = new SDKServer();
