import { NextResponse, type NextRequest } from "next/server";

// 乐观检查：没有会话 cookie 直接跳登录页；真正的校验在页面与 action 里的 requireAuth()
export function proxy(request: NextRequest) {
  if (!request.cookies.has("paper_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
