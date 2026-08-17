import {
  type Branding,
  escapeHtml,
  firstName,
  layout,
  renderWithOverride,
  summaryTable,
} from "./_shared";
import type { EmailTemplateOverride } from "../email-config";

export const INTAKE_CONFIRMATION_PLACEHOLDER_KEYS = [
  "submitterName",
  "submitterFirstName",
  "formName",
  "title",
  "humanId",
  "summaryTable",
] as const;

export function renderIntakeConfirmation({
  submitterName,
  submitterEmail,
  formName,
  title,
  humanId,
  responses,
  branding,
  override,
}: {
  submitterName: string;
  submitterEmail?: string;
  formName: string;
  title?: string;
  /** The ticket number (e.g. WEB-777) — shown so the submitter can quote it later. */
  humanId?: string;
  responses?: { label: string; value: string }[];
  branding?: Branding;
  override?: EmailTemplateOverride;
}): { subject: string; html: string; text: string } {
  const form = escapeHtml(formName);
  const name = escapeHtml(firstName(submitterName));
  const heading = `We've received your ${form} request`;

  const summaryRows: { label: string; value: string }[] = [];
  if (humanId) summaryRows.push({ label: "Ticket number", value: humanId });
  if (submitterName) summaryRows.push({ label: "Name", value: submitterName });
  if (submitterEmail) summaryRows.push({ label: "Email", value: submitterEmail });
  if (title) summaryRows.push({ label: "Summary", value: title });

  if (responses && responses.length > 0) {
    responses.forEach((r) => {
      let value = r.value;
      value = value.replace(/<[^>]*>/g, "");
      summaryRows.push({ label: r.label, value });
    });
  }

  const summaryHtml = summaryTable(summaryRows);

  if (override?.bodyHtml) {
    return renderWithOverride({
      override,
      placeholders: {
        submitterName: name,
        submitterFirstName: escapeHtml(firstName(submitterName)),
        formName: form,
        title: escapeHtml(title ?? ""),
        humanId: escapeHtml(humanId ?? ""),
        summaryTable: summaryHtml,
      },
      fallbackSubject: `We received your ${formName} request`,
      fallbackHeading: heading,
      preheader: `Thanks — we've received your ${formName} request`,
      branding,
    });
  }

  const referenceLine = humanId
    ? `<p style="margin:0 0 24px 0;">Your ticket number is <strong style="font-family:monospace;">${escapeHtml(humanId)}</strong> — please quote it in any follow-up.</p>`
    : "";

  const body = `
    <p style="margin:0 0 16px 0;">Hi ${name},</p>
    <p style="margin:0 0 ${referenceLine ? "16" : "24"}px 0;">Thanks for reaching out. We've got your <strong>${form}</strong> submission and someone from the PEN team will follow up soon.</p>
    ${referenceLine}
    ${summaryRows.length > 0 ? `<h2 style="margin:24px 0 8px 0;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Submission summary</h2>${summaryHtml}` : ""}
    <p style="margin:24px 0 0 0;color:#6b7280;">— PEN Support</p>
  `;

  const textRows = summaryRows
    .filter((r) => !r.value.includes("<span"))
    .map((r) => `${r.label}: ${r.value}`);

  const text = [
    `Hi ${firstName(submitterName)},`,
    "",
    `Thanks for reaching out. We've got your ${formName} submission and someone from the PEN team will follow up soon.`,
    ...(humanId ? ["", `Your ticket number is ${humanId} — please quote it in any follow-up.`] : []),
    "",
    "Submission summary:",
    ...textRows,
    "",
    "— PEN Support",
  ].join("\n");

  return {
    subject: `We received your ${formName} request`,
    html: layout({
      heading,
      bodyHtml: body,
      preheader: `Thanks — we've received your ${formName} request`,
      branding,
    }),
    text,
  };
}
