import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireAdminOrManager } from "@/lib/auth";
import { brandingFrom, fromHeader, getEmailConfig } from "@/lib/email-config";
import { BASE_URL, button, escapeHtml, firstName, layout } from "@/lib/email-templates/_shared";

export async function POST(request: Request) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY is not configured on the server." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const to =
    typeof body?.to === "string" && body.to.trim()
      ? body.to.trim()
      : profile.email;

  if (!to) {
    return NextResponse.json(
      { error: "No recipient address available." },
      { status: 400 },
    );
  }

  const config = await getEmailConfig();
  const branding = brandingFrom(config);
  const name = escapeHtml(firstName(profile.name ?? "there"));

  const html = layout({
    heading: "Your email settings are working",
    preheader: "Test email from your PEN helpdesk",
    branding,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">Hi ${name},</p>
      <p style="margin:0 0 24px 0;">This is a test message confirming that Resend is connected and your email branding renders correctly. If you can read this, you're all set.</p>
      ${button({ href: BASE_URL, label: "Open PEN", branding })}
      <p style="margin:24px 0 0 0;color:#6b7280;">— PEN Support</p>
    `,
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: fromHeader(config),
    to,
    subject: "Test email — PEN helpdesk",
    html,
    text: `Hi ${firstName(profile.name ?? "there")},\n\nThis is a test message confirming that Resend is connected. If you can read this, you're all set.\n\n— PEN Support`,
    replyTo: config.replyTo || undefined,
  });

  if (result.error) {
    return NextResponse.json(
      { error: result.error.message || "Resend rejected the message." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, to, id: result.data?.id });
}
