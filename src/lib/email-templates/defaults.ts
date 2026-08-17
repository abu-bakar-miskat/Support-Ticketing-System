import type { EmailTemplateKey } from "../email-config";
import { BASE_URL, DUMMY_SIGNATURE_HTML } from "./_shared";

export type TemplateDefault = {
  label: string;
  description: string;
  subject: string;
  heading: string;
  bodyHtml: string;
  placeholders: string[];
  sample: Record<string, string>;
};

const SAMPLE_TICKET_URL = `${BASE_URL}/tickets/sample`;
const SAMPLE_BUTTON = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0;"><tr><td align="center" style="border-radius:6px;background:#06476f;"><a href="${SAMPLE_TICKET_URL}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">View ticket</a></td></tr></table>`;
const SAMPLE_SIGNATURE = `<div style="margin:24px 0 0 0;">${DUMMY_SIGNATURE_HTML}</div>`;
const SAMPLE_SUMMARY_TABLE = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin:16px 0;"><tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:12px 16px;font-weight:500;color:#6b7280;font-size:14px;">Name</td><td style="padding:12px 16px;color:#1f2937;font-size:14px;">Jamie Chen</td></tr></table>`;

export const DEFAULT_TEMPLATES: Record<EmailTemplateKey, TemplateDefault> = {
  assignment: {
    label: "Assignment",
    description: "Sent to a user when a ticket is assigned to them.",
    subject: "{{assignedByName}} assigned {{humanId}} to you",
    heading: "A ticket was assigned to you",
    bodyHtml: `<p style="margin:0 0 16px 0;">Hi {{assigneeFirstName}},</p>\n<p style="margin:0 0 24px 0;">You've been assigned to a new ticket.</p>\n{{viewTicketButton}}\n{{signature}}`,
    placeholders: [
      "assigneeName",
      "assigneeFirstName",
      "humanId",
      "ticketTitle",
      "assignedByName",
      "ticketUrl",
      "viewTicketButton",
      "signature",
    ],
    sample: {
      assigneeName: "Jamie Chen",
      assigneeFirstName: "Jamie",
      humanId: "SUP-1042",
      ticketTitle: "Laptop won't connect to VPN",
      assignedByName: "Alex Rivera",
      ticketUrl: SAMPLE_TICKET_URL,
      viewTicketButton: SAMPLE_BUTTON,
      signature: SAMPLE_SIGNATURE,
    },
  },
  invite: {
    label: "Department invite",
    description: "Sent when a manager invites someone to join a department by email.",
    subject: "{{inviterName}} invited you to join {{departmentName}}",
    heading: "You're invited to join a department",
    bodyHtml: `<p style="margin:0 0 16px 0;">Hello,</p>\n<p style="margin:0 0 24px 0;"><strong>{{inviterName}}</strong> has invited you to join <strong>{{departmentName}}</strong> as <strong>{{role}}</strong> on the <strong>{{teamName}}</strong> team.</p>\n{{messageBlock}}\n{{acceptInviteButton}}\n{{signature}}`,
    placeholders: [
      "inviteeEmail",
      "inviterName",
      "inviterFirstName",
      "departmentName",
      "teamName",
      "role",
      "message",
      "messageBlock",
      "inviteUrl",
      "acceptInviteButton",
      "signature",
    ],
    sample: {
      inviteeEmail: "jamie.chen@pengroup.com",
      inviterName: "Alex Rivera",
      inviterFirstName: "Alex",
      departmentName: "Engineering",
      teamName: "Platform",
      role: "Staff",
      message: "Looking forward to having you on the team.",
      messageBlock: `<div style="margin:0 0 24px 0;padding:14px 16px;background:#f8fafc;border-left:3px solid #0a76b9;border-radius:4px;color:#374151;font-size:15px;line-height:1.6;">Looking forward to having you on the team.</div>`,
      inviteUrl: `${BASE_URL}/invite/sample`,
      acceptInviteButton: SAMPLE_BUTTON.replace("View ticket", "Accept invitation").replace(SAMPLE_TICKET_URL, `${BASE_URL}/invite/sample`),
      signature: SAMPLE_SIGNATURE,
    },
  },
  mention: {
    label: "Mention",
    description: "Sent to a user when they're @mentioned in a comment.",
    subject: 'You were mentioned in "{{ticketTitle}}"',
    heading: "You were mentioned in a ticket",
    bodyHtml: `<p style="margin:0 0 16px 0;">Hi {{mentionedFirstName}},</p>\n<p style="margin:0 0 24px 0;">You were mentioned in a comment on the following ticket.</p>\n{{viewTicketButton}}\n{{signature}}`,
    placeholders: ["mentionedName", "mentionedFirstName", "ticketTitle", "ticketUrl", "viewTicketButton", "signature"],
    sample: {
      mentionedName: "Priya Nair",
      mentionedFirstName: "Priya",
      ticketTitle: "Laptop won't connect to VPN",
      ticketUrl: SAMPLE_TICKET_URL,
      viewTicketButton: SAMPLE_BUTTON,
      signature: SAMPLE_SIGNATURE,
    },
  },
  customerReply: {
    label: "Customer reply",
    description: "Sent when a staff member replies to a support submitter.",
    subject: "Re: {{ticketTitle}}",
    heading: "A reply to your request",
    bodyHtml: `<p style="margin:0 0 16px 0;">Hi {{submitterFirstName}},</p>\n<div style="margin:0 0 24px 0;color:#374151;font-size:15px;line-height:1.6;">{{messageHtml}}</div>\n{{signature}}\n<p style="margin:16px 0 0 0;color:#9ca3af;font-size:12px;">Reply to this email to continue the conversation.</p>`,
    placeholders: ["submitterName", "submitterFirstName", "ticketTitle", "agentName", "messageHtml", "signature"],
    sample: {
      submitterName: "Morgan Lee",
      submitterFirstName: "Morgan",
      ticketTitle: "Laptop won't connect to VPN",
      agentName: "Alex Rivera",
      messageHtml: "Thanks for the extra detail — I've reset your VPN profile, please try connecting again.",
      signature: SAMPLE_SIGNATURE,
    },
  },
  intakeConfirmation: {
    label: "Support confirmation",
    description: "Sent to the submitter right after they submit a support form.",
    subject: "We received your {{formName}} request",
    heading: "We've received your {{formName}} request",
    bodyHtml: `<p style="margin:0 0 16px 0;">Hi {{submitterFirstName}},</p>\n<p style="margin:0 0 16px 0;">Thanks for reaching out. We've got your <strong>{{formName}}</strong> submission and someone from the PEN team will follow up soon.</p>\n<p style="margin:0 0 24px 0;">Your ticket number is <strong style="font-family:monospace;">{{humanId}}</strong> — please quote it in any follow-up.</p>\n{{summaryTable}}`,
    placeholders: ["submitterName", "submitterFirstName", "formName", "title", "humanId", "summaryTable"],
    sample: {
      submitterName: "Morgan Lee",
      submitterFirstName: "Morgan",
      formName: "IT Support",
      title: "Laptop won't connect to VPN",
      humanId: "WEB-777",
      summaryTable: SAMPLE_SUMMARY_TABLE,
    },
  },
  resolution: {
    label: "Resolution",
    description: "Sent to the submitter when their ticket is resolved.",
    subject: "Your request has been resolved — {{formName}}",
    heading: "Your request has been resolved",
    bodyHtml: `<p style="margin:0 0 16px 0;">Hi {{submitterFirstName}},</p>\n<p style="margin:0 0 24px 0;">Your request <strong>{{ticketTitle}}</strong>, submitted via <strong>{{formName}}</strong>, has been resolved.</p>\n<p style="margin:24px 0 0 0;color:#6b7280;">Thank you for reaching out. — PEN Support</p>`,
    placeholders: ["submitterName", "submitterFirstName", "formName", "ticketTitle"],
    sample: {
      submitterName: "Morgan Lee",
      submitterFirstName: "Morgan",
      formName: "IT Support",
      ticketTitle: "Laptop won't connect to VPN",
    },
  },
  ticketCompleted: {
    label: "Ticket completed",
    description: "Sent to the ticket creator/watchers when a ticket is marked complete.",
    subject: "{{humanId}} has been completed",
    heading: "A ticket has been completed",
    bodyHtml: `<p style="margin:0 0 16px 0;">Hi {{recipientFirstName}},</p>\n<p style="margin:0 0 24px 0;">The following ticket has been marked as complete.</p>\n{{viewTicketButton}}`,
    placeholders: [
      "recipientName",
      "recipientFirstName",
      "humanId",
      "ticketTitle",
      "completedByName",
      "ticketUrl",
      "viewTicketButton",
    ],
    sample: {
      recipientName: "Jamie Chen",
      recipientFirstName: "Jamie",
      humanId: "SUP-1042",
      ticketTitle: "Laptop won't connect to VPN",
      completedByName: "Alex Rivera",
      ticketUrl: SAMPLE_TICKET_URL,
      viewTicketButton: SAMPLE_BUTTON,
    },
  },
};
