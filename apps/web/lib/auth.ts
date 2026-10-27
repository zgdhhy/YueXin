import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@paper/core";

export const SESSION_COOKIE = "paper_session";

interface SessionData {
  loggedIn?: boolean;
}

export async function getSession() {
  if (env.sessionSecret.length < 32) throw new Error("SESSION_SECRET 至少需要 32 个字符");
  return getIronSession<SessionData>(await cookies(), {
    cookieName: SESSION_COOKIE,
    password: env.sessionSecret,
    cookieOptions: { secure: process.env.NODE_ENV === "production" && env.siteUrl.startsWith("https"), maxAge: 60 * 60 * 24 * 30 },
  });
}

/** 页面与 server action 入口处调用；未登录跳转登录页 */
export async function requireAuth() {
  const session = await getSession();
  if (!session.loggedIn) redirect("/login");
}
