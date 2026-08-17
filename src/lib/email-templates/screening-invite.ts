import { BASE_URL, button, escapeHtml, ensureAbsoluteUrl, layout, type Branding } from "./_shared";

/**
 * Screening emails match the candidate-facing /screen page (PEN pink on dark
 * navy) rather than the workspace's ticket-email branding — spread this over
 * `brandingFrom(config)` so logo/footer still follow workspace settings.
 */
export const SCREENING_BRAND_COLORS: Pick<Branding, "brandColor" | "headerColor"> = {
  brandColor: "#FF379E",
  headerColor: "#030A2E",
};

/**
 * Screening invites keep sending from onboarding@ even though the workspace's
 * general notification address moved elsewhere — candidates reply to a person
 * (replyTo), and the recruiting thread history lives on this address.
 */
export const SCREENING_FROM_EMAIL = "onboarding@mail.pengroup.com";

/**
 * Async video screening invite. Copy supplied by the hiring team — calm and
 * plain, tells the candidate a person watches every recording and accent is
 * not scored, and flags the on-site Chattogram requirement up front.
 */
export function renderScreeningInvite({
  candidateName,
  roleTitle,
  token,
  expiryDays,
  questionCount = 4,
  senderName,
  signature,
  branding,
}: {
  candidateName: string;
  roleTitle: string;
  token: string;
  expiryDays: number;
  questionCount?: number;
  senderName?: string | null;
  /** The sender's configured signature card (Settings → signature). */
  signature?: { html: string; text: string } | null;
  branding?: Branding;
}): { subject: string; html: string; text: string } {
  const firstName = candidateName.trim().split(/\s+/)[0] || candidateName;
  const first = escapeHtml(firstName);
  const role = escapeHtml(roleTitle);
  const url = ensureAbsoluteUrl(`${BASE_URL}/screen/${token}`);
  const signoff = senderName?.trim() || "The PEN recruitment team";

  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const countWord = questionCount <= 10 ? WORDS[questionCount] : String(questionCount);
  const minutes = questionCount * 2;

  const subject = `Next step — ${roleTitle} at PEN Group (${minutes} minutes)`;

  const p = (html: string) => `<p style="margin:0 0 16px 0;">${html}</p>`;
  const li = (html: string) => `<li style="margin:0 0 8px 0;">${html}</li>`;
  const h = (text: string) =>
    `<p style="margin:24px 0 12px 0;font-weight:700;">${text}</p>`;

  const body = `
    ${p(`Hi ${first},`)}
    ${p(`Thanks for applying for the <strong>${role}</strong> role at Planet Education Networks. We'd like to take you to the next stage.`)}
    ${p(`Before anything longer, we start with ${countWord} short questions you record in your browser, whenever suits you. No call to schedule.`)}
    ${button({ href: url, label: "Start here", branding })}
    ${h("How it works")}
    <ul style="margin:0 0 16px 0;padding-left:18px;">
      ${li(`${countWord.charAt(0).toUpperCase() + countWord.slice(1)} questions, one at a time. 30 seconds to read each one, 90 seconds to answer.`)}
      ${li(`One retake per question if you're not happy with your answer.`)}
      ${li(`About ${minutes} minutes in total.`)}
      ${li(`Answers save as you go — if your connection drops, reopen the same link and carry on.`)}
    </ul>
    ${p(`You'll need a camera and microphone — <strong>when your browser asks for permission, choose Allow</strong>. Nothing records until you press start, and you can check both before the first question. Find a quiet spot where you can be alone for ${minutes} minutes.`)}
    ${p(`A person watches every recording. We care about what you say, not how polished you sound — your accent is not being scored.`)}
    ${h("What happens next")}
    ${p(`If this stage goes well, we'll send a short build task, then a final interview with the team.`)}
    ${p(`Heads up: this role is fully on-site at our Chattogram office, Monday to Friday, 9am to 5pm UK time. One of the questions asks about this — be straight with us.`)}
    ${p(`The link works for ${expiryDays} days. Recordings are stored securely and deleted after 90 days. Any questions, just reply to this email.`)}
    ${signature ? `${p(`Best,`)}${signature.html}` : p(`Best,<br />${escapeHtml(signoff)}<br />Planet Education Networks`)}
    <p style="margin:24px 0 0 0;color:#6b7280;font-size:13px;">If the button doesn't work, open: ${url}</p>
  `;

  const text = [
    `Hi ${firstName},`,
    "",
    `Thanks for applying for the ${roleTitle} role at Planet Education Networks. We'd like to take you to the next stage.`,
    "",
    `Before anything longer, we start with ${countWord} short questions you record in your browser, whenever suits you. No call to schedule.`,
    "",
    `Start here: ${url}`,
    "",
    "How it works",
    "",
    `— ${countWord.charAt(0).toUpperCase() + countWord.slice(1)} questions, one at a time. 30 seconds to read each one, 90 seconds to answer.`,
    "— One retake per question if you're not happy with your answer.",
    `— About ${minutes} minutes in total.`,
    "— Answers save as you go — if your connection drops, reopen the same link and carry on.",
    "",
    `You'll need a camera and microphone — when your browser asks for permission, choose Allow. Nothing records until you press start, and you can check both before the first question. Find a quiet spot where you can be alone for ${minutes} minutes.`,
    "",
    "A person watches every recording. We care about what you say, not how polished you sound — your accent is not being scored.",
    "",
    "What happens next",
    "",
    "If this stage goes well, we'll send a short build task, then a final interview with the team.",
    "",
    "Heads up: this role is fully on-site at our Chattogram office, Monday to Friday, 9am to 5pm UK time. One of the questions asks about this — be straight with us.",
    "",
    `The link works for ${expiryDays} days. Recordings are stored securely and deleted after 90 days. Any questions, just reply to this email.`,
    "",
    "Best,",
    ...(signature ? [signature.text] : [signoff, "Planet Education Networks"]),
  ].join("\n");

  return {
    subject,
    html: layout({ heading: `Next step for the ${role} role`, bodyHtml: body, branding }),
    text,
  };
}
