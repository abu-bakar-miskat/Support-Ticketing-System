import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import {
  acceptDepartmentInvite,
  departmentInviteLandingCookies,
  departmentInviteLandingPath,
} from "@/lib/invites/accept-department-invite";

type Params = { params: Promise<{ token: string }> };

async function acceptAndRespond(
  request: NextRequest,
  token: string,
  asJson: boolean,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    if (asJson) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `/invite/${token}`);
    return NextResponse.redirect(login);
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { id: true, email: true },
  });
  if (!profile) {
    if (asJson) return NextResponse.json({ error: "Profile not found" }, { status: 401 });
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `/invite/${token}`);
    return NextResponse.redirect(login);
  }

  const result = await acceptDepartmentInvite(token, {
    id: profile.id,
    email: profile.email,
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
      subDepartmentId: result.subDepartmentId,
      subDepartmentName: result.subDepartmentName,
      role: result.role,
      redirectPath: departmentInviteLandingPath(result),
    });
    for (const c of departmentInviteLandingCookies(result)) {
      res.cookies.set(c.name, c.value, c.options);
    }
    return res;
  }

  // Redirect straight to the role's landing page rather than "/", which only
  // re-redirects there itself — skipping that hop avoids a full extra request
  // (each re-runs getProfile's role-assignment resync). Mirrors the routing in
  // app/(dashboard)/(home)/page.tsx.
  const res = NextResponse.redirect(
    new URL(departmentInviteLandingPath(result), request.url),
  );
  for (const c of departmentInviteLandingCookies(result)) {
    res.cookies.set(c.name, c.value, c.options);
  }
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
