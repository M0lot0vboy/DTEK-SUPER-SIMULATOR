import { createServerFn } from "@tanstack/react-start";
import type {
  AdminAuditRecord,
  AdminBanRecord,
  AdminConfigStatus,
  AdminDashboardData,
  AdminPlayerSummary,
  AdminSpectateData,
  AdminViolationRecord,
} from "@/lib/admin.server";
import type { BanType } from "@/lib/anticheat.server";

export type {
  AdminAuditRecord,
  AdminBanRecord,
  AdminConfigStatus,
  AdminDashboardData,
  AdminPlayerSummary,
  AdminSpectateData,
  AdminViolationRecord,
  BanType,
};

export type AdminStatusResponse = AdminConfigStatus & {
  authenticated: boolean;
  adminUser: string | null;
};

const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

function isSecureCookie(srv: Awaited<typeof import("@tanstack/react-start/server")>): boolean {
  const proto = srv.getRequestHeader("x-forwarded-proto");
  if (proto) return proto.split(",")[0]!.trim().toLowerCase() === "https";
  return process.env.NODE_ENV === "production";
}

export const getAdminStatus = createServerFn({ method: "GET" }).handler(async (): Promise<AdminStatusResponse> => {
  const [{ getSql }, admin, srv] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/admin.server"),
    import("@tanstack/react-start/server"),
  ]);
  const cfg = admin.getAdminConfigStatus();
  if (!cfg.configured) {
    return { ...cfg, authenticated: false, adminUser: null };
  }
  const sql = await getSql();
  const cookieVal = srv.getCookie(admin.ADMIN_COOKIE_NAME);
  const adminUser = await admin.authenticateAdminSession(sql, cookieVal);
  return {
    ...cfg,
    authenticated: Boolean(adminUser),
    adminUser,
  };
});

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      username: String(d.username ?? "").trim().slice(0, 80),
      password: String(d.password ?? "").slice(0, 200),
    };
  })
  .handler(async ({ data }): Promise<{ ok: true; adminUser: string } | { ok: false; error: string }> => {
    const [{ getSql }, admin, srv] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/admin.server"),
      import("@tanstack/react-start/server"),
    ]);
    const sql = await getSql();
    const ip =
      srv.getRequestIP({ xForwardedFor: true }) ??
      srv.getRequestHeader("x-real-ip") ??
      srv.getRequestHeader("x-forwarded-for") ??
      null;
    const res = await admin.loginAdmin(sql, { ...data, ip });
    if (!res.ok) return res;

    srv.setCookie(admin.ADMIN_COOKIE_NAME, res.signedCookie, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: admin.ADMIN_SESSION_MAX_AGE,
      secure: isSecureCookie(srv),
    });
    return { ok: true, adminUser: res.adminUser };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async (): Promise<{ ok: true }> => {
  const [{ getSql }, admin, srv] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/admin.server"),
    import("@tanstack/react-start/server"),
  ]);
  const sql = await getSql();
  const cookieVal = srv.getCookie(admin.ADMIN_COOKIE_NAME);
  await admin.logoutAdminSession(sql, cookieVal);
  srv.setCookie(admin.ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: isSecureCookie(srv),
  });
  return { ok: true };
});

export const getAdminDashboard = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const sortRaw = String(d.sort ?? "updated");
    const sort =
      sortRaw === "spins" || sortRaw === "flags" || sortRaw === "pulls" || sortRaw === "updated"
        ? sortRaw
        : "updated";
    return {
      search: typeof d.search === "string" ? d.search.slice(0, 80) : "",
      sort,
    } as const;
  })
  .handler(async ({ data }): Promise<AdminDashboardData> => {
    const [{ getSql }, admin, srv] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/admin.server"),
      import("@tanstack/react-start/server"),
    ]);
    const sql = await getSql();
    const adminUser = await admin.requireAdminSession(sql, srv.getCookie(admin.ADMIN_COOKIE_NAME));
    return admin.getAdminDashboard(sql, adminUser, data);
  });

export const spectatePlayer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const playerId = String(d.playerId ?? "");
    if (!ID_RE.test(playerId)) throw new Error("Невірний ID гравця");
    return { playerId };
  })
  .handler(async ({ data }): Promise<AdminSpectateData> => {
    const [{ getSql }, admin, srv] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/admin.server"),
      import("@tanstack/react-start/server"),
    ]);
    const sql = await getSql();
    await admin.requireAdminSession(sql, srv.getCookie(admin.ADMIN_COOKIE_NAME));
    return admin.spectateAdminPlayer(sql, data.playerId);
  });

export const demonetizePlayer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const playerId = String(d.playerId ?? "");
    if (!ID_RE.test(playerId)) throw new Error("Невірний ID гравця");
    return {
      playerId,
      reason: typeof d.reason === "string" ? d.reason.slice(0, 200) : undefined,
    };
  })
  .handler(async ({ data }): Promise<AdminSpectateData> => {
    const [{ getSql }, admin, srv] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/admin.server"),
      import("@tanstack/react-start/server"),
    ]);
    const sql = await getSql();
    const adminUser = await admin.requireAdminSession(sql, srv.getCookie(admin.ADMIN_COOKIE_NAME));
    return admin.demonetizeAdminPlayer(sql, adminUser, data.playerId, data.reason);
  });

export const banPlayer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const playerId = String(d.playerId ?? "");
    if (!ID_RE.test(playerId)) throw new Error("Невірний ID гравця");
    const rawTypes = Array.isArray(d.banTypes) ? d.banTypes : [];
    const banTypes = Array.from(
      new Set(rawTypes.filter((t): t is BanType => t === "ip" || t === "chrome" || t === "pc")),
    );
    if (banTypes.length === 0) throw new Error("Обери хоча б один тип бану");
    return {
      playerId,
      banTypes,
      reason: typeof d.reason === "string" ? d.reason.slice(0, 240) : undefined,
    };
  })
  .handler(async ({ data }): Promise<AdminSpectateData> => {
    const [{ getSql }, admin, srv] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/admin.server"),
      import("@tanstack/react-start/server"),
    ]);
    const sql = await getSql();
    const adminUser = await admin.requireAdminSession(sql, srv.getCookie(admin.ADMIN_COOKIE_NAME));
    return admin.banAdminPlayer(sql, adminUser, data);
  });

export const unbanEntry = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const banId = typeof d.banId === "number" && Number.isInteger(d.banId) && d.banId > 0 ? d.banId : undefined;
    const playerId = typeof d.playerId === "string" && ID_RE.test(d.playerId) ? d.playerId : undefined;
    if (!banId && !playerId) throw new Error("Вкажи banId або playerId для розблокування");
    return { banId, playerId };
  })
  .handler(async ({ data }): Promise<{ clearedCount: number }> => {
    const [{ getSql }, admin, srv] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/admin.server"),
      import("@tanstack/react-start/server"),
    ]);
    const sql = await getSql();
    const adminUser = await admin.requireAdminSession(sql, srv.getCookie(admin.ADMIN_COOKIE_NAME));
    return admin.unbanAdminEntry(sql, adminUser, data);
  });
