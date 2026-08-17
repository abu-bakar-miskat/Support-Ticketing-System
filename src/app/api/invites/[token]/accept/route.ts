import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { acceptDepartmentInvite } from "@/lib/invites/accept-department-invite";

type Params = { params: Promise<{ token: string }> };

async function acceptAndRespond(
  request: NextRequest,
  token: string,
  asJson: boolean,
) {
  const { profile, error } = await requireAuth();
  if (error) {
    if (asJson) return error;
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `/invite/${token}`);
    return NextResponse.redirect(login);
  }

  const result = await acceptDepartmentInvite(token, {
    id: profile!.id,
    email: profile!.email,
  });

  if (!result.ok) {
    if (asJson) {
      const status =
        result.code === "not_found"
          ? 404
          : result.code === "email_mismatch"
            ? 403
            : result.code === "already_accepted"
              ? 409
              : 410;
      return NextResponse.json(
        {
          error: result.message,
          code: result.code,
          inviteEmail: result.inviteEmail,
          signedInEmail: result.signedInEmail,
        },
        { status },
      );
    }
    const inviteUrl = new URL(`/invite/${token}`, request.url);
    inviteUrl.searchParams.set("error", result.code);
    return NextResponse.redirect(inviteUrl);
  }

  if (asJson) {
    const res = NextResponse.json({
      ok: true,
      departmentId: result.departmentId,
      departmentName: result.departmentName,
      teamId: result.teamId,
      teamName: result.teamName,
      role: result.role,
    });
    res.cookies.set("pen_active_dept", result.departmentId, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
    });
    return res;
  }

  const res = NextResponse.redirect(new URL("/", request.url));
  res.cookies.set("pen_active_dept", result.departmentId, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
  });
  return res;
}

/** Browser flow from /invite/[token] — accept + set dept cookie + redirect home. */
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  return acceptAndRespond(req, token, false);
}

/** Programmatic accept (JSON). */
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  return acceptAndRespond(req, token, true);
}
