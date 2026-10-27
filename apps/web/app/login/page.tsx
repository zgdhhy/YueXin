import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { env } from "@paper/core";
import { getSession } from "@/lib/auth";
import { SiteMark } from "@/components/site-mark";

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
    <main className="flex min-h-dvh items-center justify-center bg-paper px-5 py-10">
      <form action={login} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 sm:p-10">
        <div className="mb-8">
          <SiteMark size={44}/>
          <h1 className="mt-6 text-2xl font-semibold text-balance text-ink">进入论文阅读室</h1>
          <p className="mt-3 text-sm leading-7 text-pretty text-slate-500">阅读中文精读、研究方法与趋势月报。</p>
        </div>
        <label className="relative block"><span className="sr-only">访问密码</span>
          <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="password"
            name="password"
            placeholder="访问密码"
            autoFocus
            autoComplete="current-password"
            required
            aria-invalid={!!error}
            aria-describedby={error ? "login-error" : undefined}
            className="w-full rounded-xl border-0 bg-stone-50 py-3 pr-4 pl-10 text-sm ring-1 ring-stone-200 transition ring-inset placeholder:text-stone-400 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </label>
        {error && <p id="login-error" role="alert" className="mt-3 text-sm text-red-600">密码错误，请重新输入访问密码。</p>}
        <button className="mt-5 w-full rounded-xl bg-ink py-3 text-sm font-medium text-white transition hover:bg-indigo-700">登录</button>
      </form>
    </main>
  );
}
