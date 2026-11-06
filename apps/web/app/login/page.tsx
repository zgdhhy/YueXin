import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { env } from "@paper/core";
import { getSession } from "@/lib/auth";
import { SiteMark } from "@/components/site-mark";
import { SITE_NAME } from "@/lib/brand";
import "./login.css";

async function login(formData: FormData) {
  "use server";
  const input = Buffer.from(String(formData.get("password") ?? ""));
  const expected = Buffer.from(env.adminPassword);
  const ok = env.adminPassword.length > 0 && input.length === expected.length && timingSafeEqual(input, expected);
  if (!ok) redirect("/login?error=1");
  const session = await getSession();
  session.loggedIn = true;
  await session.save();
  redirect("/");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="login-page">
      <form action={login} className="login-spread">
        <div className="login-cover"><SiteMark size={56}/><h1>{SITE_NAME}</h1></div>
        <div className="login-form">
          <label className="login-field"><span className="sr-only">访问密码</span>
            <Lock aria-hidden="true" />
            <input type="password" name="password" placeholder="访问密码" autoFocus autoComplete="current-password" required aria-invalid={!!error} aria-describedby={error ? "login-error" : undefined} />
          </label>
          {error && <p id="login-error" role="alert" className="login-error">密码错误，请重新输入访问密码。</p>}
          <button className="login-submit">登录</button>
        </div>
      </form>
    </main>
  );
}
