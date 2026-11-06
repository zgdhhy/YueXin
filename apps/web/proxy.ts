import { NextResponse, type NextRequest } from "next/server";

// 乐观检查：没有会话 cookie 直接跳登录页；真正的校验在页面与 action 里的 requireAuth()
export function proxy(request: NextRequest) {
  if (!request.cookies.has("paper_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  // 参考视频上传不经过 proxy：proxy 会把请求体缓存在内存且超过上限时静默截断；该接口自己校验会话
  matcher: ["/((?!login|api/admin/style-reference|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
