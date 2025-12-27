import express from "express";
import bcrypt from "bcryptjs";
import { prisma, accessTokenPropertyKey, refreshTokenPropertyKey, defaultAccessTokenMinutes, defaultRefreshTokenDays, getSystemPropertyNumber, signToken, createRefreshToken, hashToken, setRefreshCookie, getCookieValue, getBearerToken, verifyToken } from "../lib/helpers";

export const registerAuthRoutes = (app: express.Express) => {
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
  
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }
  
    try {
      const user = await prisma.user.findUnique({ where: { email } });
  
      if (!user) {
        res.status(401).json({ error: "Invalid credentials." });
        return;
      }
  
      const isValid = await bcrypt.compare(password, user.passwordHash);
  
      if (!isValid) {
        res.status(401).json({ error: "Invalid credentials." });
        return;
      }
  
      const accessMinutes = await getSystemPropertyNumber(
        accessTokenPropertyKey,
        defaultAccessTokenMinutes
      );
      const refreshDays = await getSystemPropertyNumber(
        refreshTokenPropertyKey,
        defaultRefreshTokenDays
      );
      const nowSeconds = Math.floor(Date.now() / 1000);
      const accessToken = signToken({
        userId: user.id,
        iat: nowSeconds,
        exp: nowSeconds + Math.max(1, Math.floor(accessMinutes * 60))
      });
  
      const refreshToken = createRefreshToken();
      const refreshTtlSeconds = Math.max(1, Math.floor(refreshDays * 24 * 60 * 60));
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000)
        }
      });
      setRefreshCookie(res, refreshToken, refreshTtlSeconds);
  
      res.json({
        token: accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } catch (error) {
      console.error("Login failed", error);
      res.status(500).json({ error: "Login failed." });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Missing token." });
      return;
    }
  
    const payload = verifyToken(token);
    if (!payload?.userId) {
      res.status(401).json({ error: "Invalid token." });
      return;
    }
  
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      res.status(401).json({ error: "Invalid token." });
      return;
    }
  
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    const refreshToken = getCookieValue(req, "ttrpg_refresh");
    if (refreshToken) {
      prisma.refreshToken
        .updateMany({
          where: { tokenHash: hashToken(refreshToken), revokedAt: null },
          data: { revokedAt: new Date() }
        })
        .catch(() => undefined);
    }
    res.clearCookie("ttrpg_refresh", { path: "/" });
    res.json({ ok: true });
  });

  app.post("/api/auth/refresh", async (req, res) => {
    const refreshToken = getCookieValue(req, "ttrpg_refresh");
    if (!refreshToken) {
      res.status(401).json({ error: "Missing refresh token." });
      return;
    }
  
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) }
    });
    if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
      res.status(401).json({ error: "Invalid refresh token." });
      return;
    }
  
    const accessMinutes = await getSystemPropertyNumber(
      accessTokenPropertyKey,
      defaultAccessTokenMinutes
    );
    const refreshDays = await getSystemPropertyNumber(
      refreshTokenPropertyKey,
      defaultRefreshTokenDays
    );
    const nowSeconds = Math.floor(Date.now() / 1000);
    const accessToken = signToken({
      userId: stored.userId,
      iat: nowSeconds,
      exp: nowSeconds + Math.max(1, Math.floor(accessMinutes * 60))
    });
  
    const nextRefreshToken = createRefreshToken();
    const refreshTtlSeconds = Math.max(1, Math.floor(refreshDays * 24 * 60 * 60));
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() }
    });
    await prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: hashToken(nextRefreshToken),
        expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000)
      }
    });
    setRefreshCookie(res, nextRefreshToken, refreshTtlSeconds);
  
    res.json({ token: accessToken });
  });

};
