/**
 * Project plan PDF for the Multi-Tenant Support Ticketing Platform.
 * Source: docs/requirements.md (SRS v1.0). Deadline: 5 September 2026.
 */
import { createWriteStream } from "fs"
import { join } from "path"
import PDFDocument from "pdfkit"

const OUT = join(process.cwd(), "docs/Project-Plan-Support-Platform-Sep-2026.pdf")

const C = {
  navy: "#0B1F33",
  ink: "#1E293B",
  muted: "#475569",
  faint: "#94A3B8",
  line: "#E2E8F0",
  paper: "#FFFFFF",
  wash: "#F1F5F9",
  accent: "#0A76B9",
  accentDark: "#075985",
  green: "#15803D",
  greenBg: "#DCFCE7",
  amber: "#B45309",
  amberBg: "#FEF3C7",
  red: "#B91C1C",
  redBg: "#FEE2E2",
  purple: "#6D28D9",
  purpleBg: "#EDE9FE",
}

type Doc = PDFKit.PDFDocument

const MARGIN = 48
const PAGE_W = 595.28
const PAGE_H = 841.89
const CONTENT_W = PAGE_W - MARGIN * 2
const FOOTER_Y = PAGE_H - 36

function withOpenMargins(doc: Doc, fn: () => void) {
  const { top, bottom, left, right } = doc.page.margins
  doc.page.margins.top = 0
  doc.page.margins.bottom = 0
  doc.page.margins.left = 0
  doc.page.margins.right = 0
  fn()
  doc.page.margins.top = top
  doc.page.margins.bottom = bottom
  doc.page.margins.left = left
  doc.page.margins.right = right
}

function fillRect(doc: Doc, x: number, y: number, w: number, h: number, color: string) {
  doc.save().rect(x, y, w, h).fill(color).restore()
}

function hr(doc: Doc, y?: number) {
  const yy = y ?? doc.y
  doc.save().strokeColor(C.line).lineWidth(0.75)
  doc.moveTo(MARGIN, yy).lineTo(PAGE_W - MARGIN, yy).stroke().restore()
}

function footer(doc: Doc) {
  const page = doc.bufferedPageRange()
  // Applied after all pages exist via switchToPage.
  void page
}

function addRunningFooter(doc: Doc, pageNum: number, total: number) {
  withOpenMargins(doc, () => {
    doc.save()
    doc.strokeColor(C.line).lineWidth(0.6)
    doc.moveTo(MARGIN, FOOTER_Y - 10).lineTo(PAGE_W - MARGIN, FOOTER_Y - 10).stroke()
    doc.font("Helvetica").fontSize(8).fillColor(C.faint)
    doc.text("PEN Support Platform  ·  Project Plan  ·  Confidential", MARGIN, FOOTER_Y, {
      width: CONTENT_W / 2,
      align: "left",
      lineBreak: false,
    })
    doc.text(`Page ${pageNum} of ${total}`, MARGIN + CONTENT_W / 2, FOOTER_Y, {
      width: CONTENT_W / 2,
      align: "right",
      lineBreak: false,
    })
    doc.restore()
  })
}

function ensureSpace(doc: Doc, needed: number) {
  if (doc.y + needed > PAGE_H - 64) {
    doc.addPage()
    doc.y = MARGIN
  }
}

function h1(doc: Doc, text: string) {
  ensureSpace(doc, 36)
  doc.font("Helvetica-Bold").fontSize(16).fillColor(C.navy).text(text, MARGIN, doc.y, { width: CONTENT_W })
  doc.moveDown(0.25)
  fillRect(doc, MARGIN, doc.y, 48, 3, C.accent)
  doc.moveDown(0.7)
}

function h2(doc: Doc, text: string) {
  ensureSpace(doc, 28)
  doc.moveDown(0.3)
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor(C.accentDark).text(text, MARGIN, doc.y, { width: CONTENT_W })
  doc.moveDown(0.35)
}

function para(doc: Doc, text: string) {
  doc.font("Helvetica").fontSize(9.5).fillColor(C.ink).text(text, MARGIN, doc.y, {
    width: CONTENT_W,
    lineGap: 2.2,
    align: "justify",
  })
  doc.moveDown(0.45)
}

function bullet(doc: Doc, text: string, indent = 12) {
  const x = MARGIN + indent
  const w = CONTENT_W - indent
  const y = doc.y
  doc.font("Helvetica").fontSize(9.5).fillColor(C.accent)
  doc.text("•", MARGIN + 2, y, { width: 10 })
  doc.font("Helvetica").fontSize(9.5).fillColor(C.ink)
  doc.text(text, x, y, { width: w, lineGap: 1.8 })
  doc.moveDown(0.22)
}

function badge(doc: Doc, x: number, y: number, label: string, bg: string, fg: string) {
  const padX = 6
  doc.font("Helvetica-Bold").fontSize(7)
  const w = doc.widthOfString(label) + padX * 2
  const h = 12
  doc.save()
  doc.roundedRect(x, y, w, h, 2).fill(bg)
  doc.fillColor(fg).text(label, x, y + 2.5, { width: w, align: "center" })
  doc.restore()
  return w
}

type Col = { label: string; width: number; align?: "left" | "center" | "right" }

function table(
  doc: Doc,
  columns: Col[],
  rows: string[][],
  opts?: { headerFill?: string; rowHeight?: number },
) {
  const headerH = 18
  const minRow = opts?.rowHeight ?? 16
  const startX = MARGIN
  const headerFill = opts?.headerFill ?? C.navy

  const drawHeader = () => {
    const y = doc.y
    fillRect(doc, startX, y, CONTENT_W, headerH, headerFill)
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#FFFFFF")
    let x = startX
    for (const col of columns) {
      doc.text(col.label, x + 5, y + 5, {
        width: col.width - 10,
        align: col.align ?? "left",
        lineBreak: false,
      })
      x += col.width
    }
    doc.y = y + headerH
  }

  ensureSpace(doc, headerH + minRow + 8)
  drawHeader()

  rows.forEach((row, i) => {
    doc.font("Helvetica").fontSize(8).fillColor(C.ink)
    const heights = row.map((cell, ci) =>
      doc.heightOfString(cell ?? "", { width: columns[ci].width - 10, lineGap: 1 }),
    )
    const h = Math.max(minRow, Math.max(...heights) + 8)

    if (doc.y + h > PAGE_H - 64) {
      doc.addPage()
      doc.y = MARGIN
      drawHeader()
      doc.font("Helvetica").fontSize(8).fillColor(C.ink)
    }

    const y = doc.y
    if (i % 2 === 0) fillRect(doc, startX, y, CONTENT_W, h, C.wash)
    let x = startX
    for (let ci = 0; ci < columns.length; ci++) {
      const col = columns[ci]
      doc.font("Helvetica").fontSize(8).fillColor(C.ink)
      doc.text(row[ci] ?? "", x + 5, y + 4, {
        width: col.width - 10,
        align: col.align ?? "left",
        lineGap: 1,
      })
      x += col.width
      doc.y = y
    }
    doc.y = y + h
  })
  doc.moveDown(0.6)
}

function callout(doc: Doc, title: string, body: string, bg: string, accent: string) {
  const pad = 10
  doc.font("Helvetica").fontSize(9).fillColor(C.ink)
  const bodyH = doc.heightOfString(body, { width: CONTENT_W - pad * 2 - 6, lineGap: 2 })
  const h = 22 + bodyH + pad
  ensureSpace(doc, h + 8)
  const y = doc.y
  doc.save()
  doc.roundedRect(MARGIN, y, CONTENT_W, h, 3).fill(bg)
  doc.rect(MARGIN, y, 4, h).fill(accent)
  doc.restore()
  doc.font("Helvetica-Bold").fontSize(9).fillColor(accent)
  doc.text(title, MARGIN + pad + 4, y + 8, { width: CONTENT_W - pad * 2 - 6 })
  doc.font("Helvetica").fontSize(9).fillColor(C.ink)
  doc.text(body, MARGIN + pad + 4, y + 22, { width: CONTENT_W - pad * 2 - 6, lineGap: 2 })
  doc.y = y + h + 10
}

function kpiRow(
  doc: Doc,
  items: { label: string; value: string; sub?: string }[],
) {
  const gap = 8
  const w = (CONTENT_W - gap * (items.length - 1)) / items.length
  const h = 52
  ensureSpace(doc, h + 12)
  let x = MARGIN
  const y = doc.y
  for (const item of items) {
    doc.save()
    doc.roundedRect(x, y, w, h, 3).fill(C.wash)
    doc.restore()
    doc.font("Helvetica").fontSize(7).fillColor(C.muted)
    doc.text(item.label.toUpperCase(), x + 10, y + 8, { width: w - 20, lineBreak: false })
    doc.font("Helvetica-Bold").fontSize(13).fillColor(C.navy)
    doc.text(item.value, x + 10, y + 20, { width: w - 20, lineBreak: false })
    if (item.sub) {
      doc.font("Helvetica").fontSize(7.5).fillColor(C.muted)
      doc.text(item.sub, x + 10, y + 38, { width: w - 20, lineBreak: false })
    }
    x += w + gap
    doc.y = y
  }
  doc.y = y + h + 14
}

function drawCover(doc: Doc) {
  fillRect(doc, 0, 0, PAGE_W, PAGE_H, C.navy)
  fillRect(doc, 0, 0, 10, PAGE_H, C.accent)

  doc.fillColor("#FFFFFF")
  doc.font("Helvetica").fontSize(9)
  doc.text("PLANET EDUCATION NETWORKS", MARGIN + 12, 72)
  doc.font("Helvetica").fontSize(8).fillColor("#7DD3FC")
  doc.text("MULTI-TENANT SUPPORT TICKETING PLATFORM", MARGIN + 12, 88)

  doc.fillColor("#FFFFFF")
  doc.font("Helvetica-Bold").fontSize(32)
  doc.text("Project Plan", MARGIN + 12, 160, { width: CONTENT_W })
  doc.font("Helvetica").fontSize(14).fillColor("#BAE6FD")
  doc.text("Delivery to 5 September 2026", MARGIN + 12, 204, { width: CONTENT_W })

  doc.moveTo(MARGIN + 12, 240).lineTo(MARGIN + 120, 240)
  doc.strokeColor(C.accent).lineWidth(3).stroke()

  doc.font("Helvetica").fontSize(10).fillColor("#E2E8F0")
  const meta = [
    ["Document", "Project Implementation Plan"],
    ["Source of truth", "SRS v1.0  ·  docs/requirements.md"],
    ["Derived from", "BRD v0.3.1  ·  IEEE 830 / ISO-IEC-IEEE 29148"],
    ["Plan date", "18 August 2026"],
    ["Release deadline", "Friday 5 September 2026"],
    ["Working days", "14  (18 Aug – 4 Sep)  +  5 Sep release"],
    ["Status", "For engineering, QA and product"],
  ]
  let y = 268
  for (const [k, v] of meta) {
    doc.font("Helvetica").fontSize(8.5).fillColor("#94A3B8").text(k, MARGIN + 12, y, { width: 130 })
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#FFFFFF").text(v, MARGIN + 150, y, { width: 340 })
    y += 22
  }

  doc.font("Helvetica").fontSize(8).fillColor("#94A3B8")
  doc.text(
    "This plan maps the SRS onto the existing PEN ticketing codebase (decision D-01). It is a time-boxed delivery plan, not a commitment to ship the entire SRS by the deadline.",
    MARGIN + 12,
    470,
    { width: CONTENT_W, lineGap: 3 },
  )

  withOpenMargins(doc, () => {
    fillRect(doc, 0, PAGE_H - 108, PAGE_W, 108, "#071422")
    doc.font("Helvetica").fontSize(8).fillColor("#7DD3FC")
    doc.text("RELEASE GOAL", MARGIN + 12, PAGE_H - 88, { lineBreak: false })
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#FFFFFF")
    doc.text(
      "Support MVP: tenant-isolated Support template with department boards, scoped agents, email intake, and SLA.",
      MARGIN + 12,
      PAGE_H - 70,
      { width: CONTENT_W, height: 44 },
    )
  })
}

function drawGantt(doc: Doc) {
  h2(doc, "3.1  Calendar Gantt (working days)")
  para(
    doc,
    "Bars show the intended window, not guaranteed finish. HITL slices (01, 04, 06, 14, 22) require same-day migration review. Dark bars are P0; hatched-look bars (lighter) are P1 stretch.",
  )

  const weeks = [
    { label: "W1  18–21 Aug", days: "4d" },
    { label: "W2  24–28 Aug", days: "5d" },
    { label: "W3  31 Aug–4 Sep", days: "5d" },
    { label: "5 Sep", days: "Rel." },
  ]
  const rows: { name: string; start: number; span: number; p0: boolean }[] = [
    { name: "P1  RBAC & isolation (01–03)", start: 0, span: 1, p0: true },
    { name: "P2  Board & sub-dept (04–07)", start: 0, span: 2, p0: true },
    { name: "P3a Forms + comments + mail", start: 1, span: 2, p0: true },
    { name: "P3b SLA + assignment + hours", start: 1, span: 2, p0: true },
    { name: "P3c Filters + dept settings", start: 2, span: 1, p0: true },
    { name: "P1 stretch  Rules engine", start: 2, span: 1, p0: false },
    { name: "P4  Flags + tenant lifecycle", start: 2, span: 1, p0: false },
    { name: "UAT, freeze, release", start: 2, span: 2, p0: true },
  ]

  const labelW = 168
  const chartW = CONTENT_W - labelW
  const colW = chartW / weeks.length
  const rowH = 18
  const headH = 28

  ensureSpace(doc, headH + rows.length * rowH + 40)
  const originY = doc.y

  // Week headers
  weeks.forEach((w, i) => {
    const x = MARGIN + labelW + i * colW
    fillRect(doc, x, originY, colW - 2, headH, i === 3 ? C.accent : C.navy)
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#FFFFFF")
    doc.text(w.label, x + 4, originY + 5, { width: colW - 10, align: "center", lineBreak: false })
    doc.font("Helvetica").fontSize(6.5).fillColor("#BAE6FD")
    doc.text(w.days, x + 4, originY + 16, { width: colW - 10, align: "center", lineBreak: false })
  })
  doc.y = originY
  doc.font("Helvetica-Bold").fontSize(7).fillColor(C.muted)
  doc.text("WORKSTREAM", MARGIN, originY + 10, { width: labelW - 8, lineBreak: false })

  rows.forEach((r, i) => {
    const y = originY + headH + i * rowH
    if (i % 2 === 0) fillRect(doc, MARGIN, y, CONTENT_W, rowH, C.wash)
    doc.font("Helvetica").fontSize(7.5).fillColor(C.ink)
    doc.text(r.name, MARGIN + 4, y + 5, { width: labelW - 10, lineBreak: false })
    const barX = MARGIN + labelW + r.start * colW + 3
    const barW = r.span * colW - 8
    doc.save()
    doc.roundedRect(barX, y + 4, barW, 10, 2).fill(r.p0 ? C.accent : "#93C5FD")
    doc.restore()
  })

  doc.y = originY + headH + rows.length * rowH + 8
  doc.font("Helvetica").fontSize(7.5).fillColor(C.muted)
  doc.text("P0 critical path  ", MARGIN, doc.y, { continued: true })
  doc.fillColor(C.accent).text("████  ", { continued: true })
  doc.fillColor(C.muted).text("   P1 stretch  ", { continued: true })
  doc.fillColor("#93C5FD").text("████")
  doc.moveDown(0.8)
}

function main() {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: 52, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: "Project Plan — Multi-Tenant Support Ticketing Platform",
      Author: "Planet Education Networks",
      Subject: "Delivery plan to 5 September 2026, derived from SRS v1.0",
      CreationDate: new Date("2026-08-18"),
    },
  })

  const stream = createWriteStream(OUT)
  doc.pipe(stream)

  // ── Cover ────────────────────────────────────────────────────────────────
  drawCover(doc)

  // ── 1. Control + summary ─────────────────────────────────────────────────
  doc.addPage()
  h1(doc, "1.  Document control")

  table(
    doc,
    [
      { label: "FIELD", width: 140 },
      { label: "VALUE", width: CONTENT_W - 140 },
    ],
    [
      ["Product", "Multi-Tenant Support Ticketing Platform"],
      ["Spec", "SRS v1.0 (Draft) — docs/requirements.md"],
      ["Plan version", "1.0  ·  18 August 2026"],
      ["Planning horizon", "18 August 2026 → 5 September 2026"],
      ["Working days", "14 weekdays + Saturday 5 Sep as release day"],
      ["Approach", "Map onto existing models; additive migrations only (D-01, AGENTS.md)"],
      ["Issue backlog", "23 tracer-bullet slices in .scratch/support-platform"],
      ["Audience", "Engineering, QA, Product/BA, Super Admin stakeholders"],
    ],
  )

  h2(doc, "1.1  Executive summary")
  para(
    doc,
    "The SRS specifies a full multi-tenant Support template: Super Admin tenancy, RoleAssignment RBAC, department boards with immutable status types, sub-department isolation (SD-06), email intake, dynamic forms, rules, SLA, assignment, working hours, comments, reporting and search. Design decisions D-01–D-12 were locked on 17 August 2026. The existing PEN ticketing app already has Tenant, Department, Team, Ticket, TicketMessage, intake forms, RoleAssignment, BoardColumn.statusType, and a Prisma tenant-scope extension — so this is a realisation programme, not a greenfield build.",
  )
  callout(
    doc,
    "Hard constraint",
    "Fourteen working days cannot absorb the entire SRS, the deferred BRD §8 items, Postgres RLS, or per-tenant SAML/OIDC. This plan ships a Support MVP on 5 September. Everything else is sequenced as P1 stretch or a post-deadline hardening wave. Treating the full SRS as in-scope for 5 Sep is the primary delivery risk.",
    C.amberBg,
    C.amber,
  )

  kpiRow(doc, [
    { label: "Calendar", value: "19 days", sub: "18 Aug – 5 Sep" },
    { label: "Working days", value: "14", sub: "Mon–Fri only" },
    { label: "P0 slices", value: "16 of 23", sub: "Phases 1–2 + ops core" },
    { label: "Staffing", value: "2 eng.", sub: "+ same-day HITL" },
  ])

  h2(doc, "1.2  Release goal (5 September)")
  para(
    doc,
    "A Super Admin can create and suspend a tenant. A Project Admin can create departments (each with one Support board). Department Admins configure sub-departments, connect a mailbox, and manage agents. Agents work tickets on a status-typed board, reply to customers by email, and see SLA state. Every list, board, search and API path is tenant- and sub-department-scoped. Customers have no login — all requester interaction is by email (in-scope for this phase).",
  )

  // ── 2. Baseline ──────────────────────────────────────────────────────────
  h1(doc, "2.  Current baseline vs SRS target")
  para(
    doc,
    "Decision D-01: realise the SRS on the existing codebase; introduce new entities only where no equivalent exists. The table below is the honest starting point as of 18 August 2026.",
  )

  table(
    doc,
    [
      { label: "AREA", width: 130 },
      { label: "IN CODE TODAY", width: 200 },
      { label: "SRS GAP TO CLOSE BY 5 SEP", width: CONTENT_W - 330 },
    ],
    [
      [
        "Tenancy",
        "Tenant, TenantMembership, invites",
        "Suspend / restrict with session invalidation; Agreement record (P1)",
      ],
      [
        "RBAC",
        "RoleAssignment + resolver; Profile.role still live; legacy tables write-path",
        "Slice 03 cutover: RoleAssignment is sole authz source",
      ],
      [
        "Isolation",
        "Prisma tenant extension; SD-06 predicate sketched",
        "Mandatory on every ticket read; CI cross-tenant negatives; RLS later",
      ],
      [
        "Board",
        "BoardColumn + statusType; 5 default columns",
        "Finish dept-board cutover; TeamStatus migration; add/reorder/delete-with-move",
      ],
      [
        "Sub-dept",
        "Team model still the unit of work",
        "Treat Team as SubDepartment tag; SD-06 on all read paths",
      ],
      [
        "Tickets",
        "TeamTicketCounter; Project/Sprint still in product",
        "Per-department reference; hide Project/Sprint/Hub from Support UX",
      ],
      [
        "Email",
        "TicketMessage, outbound reply, inbound domain work in flight",
        "MailboxConnection at dept/sub-dept; threading; auto-mail suppress",
      ],
      [
        "Forms",
        "IntakeFormConfig / IntakeFormField",
        "Versioned fields, public URL, ticket-on-submit (map to Form)",
      ],
      [
        "SLA / rules",
        "Thin SlaRule / RoutingRule models",
        "Policy engine, timers, indicator, confirmed rule actions",
      ],
      [
        "Hours",
        "MemberSchedule, MemberHoliday, doNotAssign",
        "Wire into assignment + SLA pause; unavailability flag on board",
      ],
      [
        "Platform",
        "ActivityLog (mutable operational log)",
        "FeatureFlag, immutable AuditEvent (P1 / post)",
      ],
    ],
  )

  // ── 3. Scope ─────────────────────────────────────────────────────────────
  h1(doc, "3.  Scope for 5 September")
  h2(doc, "3.0  Priority rules")
  bullet(doc, "P0 — must ship or the Support template is not usable / not isolated. No slip past 5 Sep.")
  bullet(doc, "P1 — stretch inside the window if P0 is green by end of Week 2; otherwise first items after release.")
  bullet(doc, "P2 — explicitly out of the 5 Sep release. Scheduled as Wave 2 (from 8 Sep).")
  bullet(doc, "[Unconfirmed] SRS items stay gated unless already resolved in §10 (OQ-01–OQ-08 are resolved).")
  bullet(doc, "BRD §8 deferred items (portal, KB, CSAT, webhooks, macros, merge/split, localisation) stay out.")

  h2(doc, "P0 — Support MVP (in scope)")
  table(
    doc,
    [
      { label: "PHASE", width: 70 },
      { label: "SLICES", width: 70 },
      { label: "SRS COVERAGE", width: CONTENT_W - 140 },
    ],
    [
      ["1  RBAC", "01, 02, 03", "D-02, D-06, SRS-AC-01, C-01/C-02, NFR-01/02. RoleAssignment is write+read source. Prisma scope cannot be omitted. CI negative tests."],
      ["2  Board", "04, 05, 06, 07", "BD-01–BD-09, SD-01–SD-06, PA-02, DAT-02/03, D-04/D-05/D-07. Dept board, status_type, Team as sub-dept, per-dept reference, reopen/escalate."],
      ["3  Ops", "08, 10, 11, 12, 14, 15, 16, 17", "Forms FM-01–04/06/07; SLA-01–04/07 + indicator; ASG-01–04; WH-01–04; EM-01–04/06; DS-01–05/08–10; CM-01–03; FLT-01–03/05."],
      ["4  Admin", "22 (core)", "SA-01, SA-03 tenant create/edit/suspend/restrict. Session invalidation within 60s."],
    ],
  )

  h2(doc, "P1 — stretch (pull in only if P0 is green 28 Aug)")
  table(
    doc,
    [
      { label: "SLICE", width: 50 },
      { label: "ITEM", width: 160 },
      { label: "SRS", width: CONTENT_W - 210 },
    ],
    [
      ["09", "Rules engine", "RE-01–RE-05, OQ-06 confirmed actions, stop-processing flag"],
      ["13", "Bulk reassign + transfer", "ASG-05, ASG-06  (async; progress summary)"],
      ["19", "FeatureFlag", "SA-04  — hide in UI and 403 at API"],
      ["20", "AuditEvent", "NFR-09, DAT-05  — immutable; config/permission changes"],
      ["21", "Agreement record", "SA-02; SA-06 reminders remain unconfirmed / skip"],
    ],
  )

  h2(doc, "P2 — out of 5 September")
  table(
    doc,
    [
      { label: "ITEM", width: 200 },
      { label: "WHY IT SLIPS", width: CONTENT_W - 200 },
    ],
    [
      ["18  Reporting + CSV/PDF export", "Depends on 03, 08, 10. Custom form-field reports and async export are a week of work."],
      ["23  Postgres RLS", "Hardening phase per D-02 — not the initial isolation control."],
      ["Template marketplace TM-01–06", "D-03: seed Support template only; catalogue + access-request flow deferred."],
      ["SA-05 tenant summary dashboard", "Marked [Unconfirmed]; not required for MVP."],
      ["SAML/OIDC SSO (IDP-01)", "D-12: keep Supabase + MFA; defer per-tenant SSO."],
      ["Mailbox OAuth M365/Google (EM-05)", "D-10: land behind provider abstraction later; IMAP/current inbound first."],
      ["Domain verification DS-07", "[Unconfirmed]; outbound uses existing Resend path."],
      ["Customer portal, KB, CSAT, webhooks", "SRS §8 / OQ-01 — named future phase."],
    ],
  )

  drawGantt(doc)

  // ── 4. Week plan ─────────────────────────────────────────────────────────
  h1(doc, "4.  Week-by-week plan")
  para(
    doc,
    "Recommended staffing: two engineers (A = isolation/board critical path, B = operations once unblocked) plus a reviewer who can approve additive SQL the same day. Shared-DB rule: never prisma migrate dev / reset; generate SQL with migrate diff, strip unrelated DROP statements, apply, resolve --applied, prisma generate.",
  )

  h2(doc, "Week 1  ·  Tue 18 – Fri 21 August  ·  Close Phase 1, open Phase 2")
  table(
    doc,
    [
      { label: "DAY", width: 70 },
      { label: "ENGINEER A", width: (CONTENT_W - 70) / 2 },
      { label: "ENGINEER B", width: (CONTENT_W - 70) / 2 },
    ],
    [
      ["Tue 18", "01 remaining AC: backfill completeness, dept-access via resolver.", "Inventory every ticket/list/search query vs scope extension; list leak paths."],
      ["Wed 19", "02: Prisma extension on all tenant-owned models; unique-read → 404 (API-04).", "CI cross-tenant + cross-sub-dept negative tests (SD-06)."],
      ["Thu 20", "03: write-path cutover to RoleAssignment; stop using Profile.role as authz.", "PA-04: Project Admin reporting-only — deny board/ticket unless extra role."],
      ["Fri 21", "HITL review of 03. Start 04: department board seed + status_type immutability.", "Map TeamStatus → BoardColumn for live departments (no data loss)."],
    ],
  )
  callout(
    doc,
    "Week 1 exit gate  (end Fri 21 Aug)",
    "RoleAssignment is the authorization source of truth. Cross-tenant negative tests are in CI and failing closed. No ticket list can be queried without the tenant (+ SD-06 when scoped) predicate. If 03 is not merged, do not start 06 (ticket identity) — continue 04 only.",
    C.greenBg,
    C.green,
  )

  h2(doc, "Week 2  ·  Mon 24 – Fri 28 August  ·  Phase 2 complete")
  table(
    doc,
    [
      { label: "DAY", width: 70 },
      { label: "ENGINEER A", width: (CONTENT_W - 70) / 2 },
      { label: "ENGINEER B", width: (CONTENT_W - 70) / 2 },
    ],
    [
      ["Mon 24", "04 HITL: add/rename/reorder/delete-with-move; DAT-02/03.", "05: Ticket.sub-department via Team id; whole-dept vs sub-dept grants (SD-04)."],
      ["Tue 25", "06: per-department ticket reference; hide Project/Sprint/Hub in Support UI.", "05: SD-06 on board, list, search, notify, export, API — negative tests."],
      ["Wed 26", "06 HITL: TeamTicketCounter → dept reference backfill.", "07: BD-07 sub-status from last PUBLIC message."],
      ["Thu 27", "07: BD-08 escalate = explicit only; BD-09 reopen to first OPEN + Reopened label.", "07: OQ-05 auto-clear Reopened on first agent reply; OQ-03 SLA hooks (no-op until 10)."],
      ["Fri 28", "Phase 2 regression on live-shaped data. Fix isolation leaks.", "Start 08: map intake → Form; public URL; ticket-on-submit."],
    ],
  )
  callout(
    doc,
    "Week 2 exit gate  (end Fri 28 Aug)  — GO / NO-GO for P1 stretch",
    "GO if: one board per department, five default columns, status_type never used as a label, SD-06 holds on every read path, tickets have a department reference, Projects/Hub gone from Support UX, reopen/escalate behave per OQ-04/05. NO-GO: drop P1 (rules, audit, agreements, bulk reassign) and spend Week 3 finishing P0 only.",
    C.amberBg,
    C.amber,
  )

  h2(doc, "Week 3  ·  Mon 31 August – Thu 3 September  ·  Operations")
  table(
    doc,
    [
      { label: "DAY", width: 70 },
      { label: "ENGINEER A", width: (CONTENT_W - 70) / 2 },
      { label: "ENGINEER B", width: (CONTENT_W - 70) / 2 },
    ],
    [
      ["Mon 31", "14 HITL: MailboxConnection DEPARTMENT | SUB_DEPARTMENT; inbound → ticket.", "10: SlaPolicy + SlaTimer; first-response vs resolution; injected clock tests."],
      ["Tue 1", "14: threading (In-Reply-To / References / subject ref); Auto-Submitted suppress.", "11+12: rule / round-robin / workload / manual; exclude off-hours + unavailable."],
      ["Wed 2", "16: single feed; Internal Note vs Reply; never leak internal to email (CM-03).", "10: at-risk 80% + breach notify; ON_TRACK / AT_RISK / BREACHED indicator."],
      ["Thu 3", "15: branding, sender, DS-03 templates + tokens; DS-08 first-run walkthrough.", "17: filter assignee/status/priority/date; custom field; URL-serialised filters."],
    ],
  )

  h2(doc, "Fri 4 September  ·  Hardening  ·  Sat 5 September  ·  Release")
  table(
    doc,
    [
      { label: "DAY", width: 70 },
      { label: "ACTIVITY", width: CONTENT_W - 70 },
    ],
    [
      ["Fri 4", "Code freeze 12:00. Cross-tenant + SD-06 test suite green. WCAG spot-check on public form. Mailbox failure surfacing. Performance smoke on a 500-ticket board (NFR-05 target p95 ≤ 2s — record, do not block if infra-limited). Super Admin tenant suspend dry-run. Backup restore note (NFR-12)."],
      ["Sat 5", "Release Support MVP. Feature-flag any unfinished P1. Capture residual defects into Wave 2. No schema experiments on the shared DB after freeze."],
    ],
  )

  // ── 5. Slice WBS ─────────────────────────────────────────────────────────
  h1(doc, "5.  Work breakdown — 23 slices")
  para(
    doc,
    "Order from .scratch/support-platform: 01 → 02 → 03 → 04 → (05, 06) → 07 → Phase 3 → Phase 4. HITL = human must review the additive SQL before apply. Effort is planning days for one engineer, not calendar days (two engineers compress the calendar as shown in §4).",
  )

  table(
    doc,
    [
      { label: "#", width: 28 },
      { label: "SLICE", width: 175 },
      { label: "PH", width: 28 },
      { label: "PRI", width: 32 },
      { label: "HITL", width: 36 },
      { label: "DAYS", width: 36 },
      { label: "WINDOW", width: CONTENT_W - 335 },
    ],
    [
      ["01", "RoleAssignment + scope resolver", "1", "P0", "Yes", "2", "W1  ·  in progress"],
      ["02", "Prisma scope extension + CI negatives", "1", "P0", "No", "2", "W1"],
      ["03", "Authz cutover; retire Profile.role", "1", "P0", "No", "2", "W1"],
      ["04", "Department board + status_type columns", "2", "P0", "Yes", "3", "W1–W2"],
      ["05", "Team → SubDepartment + SD-06", "2", "P0", "No", "3", "W2"],
      ["06", "Dept reference; hide Projects & hub", "2", "P0", "Yes", "2", "W2"],
      ["07", "Sub-status, reopen, escalate", "2", "P0", "No", "2", "W2"],
      ["08", "Forms: versioned, public URL, ticket", "3", "P0", "No", "2", "W2–W3"],
      ["09", "Rules engine + dry-run", "3", "P1", "No", "3", "W3 if GO"],
      ["10", "SLA policies, timers, indicator", "3", "P0", "No", "3", "W3"],
      ["11", "Assignment methods + failure", "3", "P0", "No", "2", "W3"],
      ["12", "Working hours + availability", "3", "P0", "No", "1.5", "W3 (with 11)"],
      ["13", "Bulk reassign + transfer", "3", "P1", "No", "2", "W3 if GO"],
      ["14", "MailboxConnection + threading", "3", "P0", "Yes", "3", "W3"],
      ["15", "Branding, senders, templates, walkthrough", "3", "P0", "No", "2", "W3"],
      ["16", "Comments feed, reply vs note", "3", "P0", "No", "2", "W3"],
      ["17", "Board filters + scoped search", "3", "P0", "No", "1.5", "W3"],
      ["18", "Reporting + CSV/PDF export", "3", "P2", "No", "4", "Wave 2"],
      ["19", "Per-tenant FeatureFlag", "4", "P1", "No", "1", "W3 if GO"],
      ["20", "Immutable AuditEvent", "4", "P1", "No", "1.5", "Wave 2 / stretch"],
      ["21", "Agreement + expiry reminders", "4", "P1", "No", "1.5", "Wave 2 / stretch"],
      ["22", "Tenant lifecycle + access restrict", "4", "P0", "Yes", "2", "W3 (core SA-01/03)"],
      ["23", "Postgres RLS hardening", "4", "P2", "Yes", "3", "Wave 2"],
    ],
  )

  para(
    doc,
    "P0 effort ≈ 32 engineer-days. Two engineers × 14 working days = 28 engineer-days available. The 4-day gap is absorbed by: (a) 01/02/04 already started in code, (b) dropping P1 automatically on a Week 2 NO-GO, (c) Saturday 5 Sep as release-only, not build. If staffing is one engineer, P0 must shrink to Phases 1–2 plus mailbox/comments only — SLA, assignment and walkthrough slip to Wave 2.",
  )

  // ── 6. Milestones ────────────────────────────────────────────────────────
  h1(doc, "6.  Milestones and quality gates")
  table(
    doc,
    [
      { label: "DATE", width: 80 },
      { label: "MILESTONE", width: 150 },
      { label: "EVIDENCE", width: CONTENT_W - 230 },
    ],
    [
      ["21 Aug", "M1  Isolation locked", "03 merged. CI negatives green. Profile.role unused for authz."],
      ["28 Aug", "M2  Support board live", "Dept board in UI. SD-06 negatives. GO/NO-GO for P1."],
      ["3 Sep", "M3  Code complete (P0)", "Mail in+out, SLA indicator, assignment, filters, suspend tenant."],
      ["4 Sep 12:00", "M4  Freeze", "No feature merges. Defects only. Backup + restore note."],
      ["5 Sep", "M5  Support MVP release", "Tagged release. Known-gap list published. Wave 2 backlog cut."],
    ],
  )

  h2(doc, "6.1  Definition of Done (every P0 slice)")
  bullet(doc, "Acceptance criteria in the slice file ticked; SRS IDs named in the PR.")
  bullet(doc, "Additive migration reviewed (no DROP COLUMN/TABLE from unrelated drift); applied to shared DB; migrate resolve --applied; prisma generate.")
  bullet(doc, "Authorisation evaluated server-side (C-02). UI hiding is never the control.")
  bullet(doc, "Timestamps UTC in DB (C-04). Status Type used for logic, never column label (C-03).")
  bullet(doc, "Negative tests for out-of-scope reads (404 not 403 across tenants — API-04).")
  bullet(doc, "No completion/assignment emails fired against real department managers while testing on the shared DB.")

  h2(doc, "6.2  NFR checks inside the window")
  table(
    doc,
    [
      { label: "ID", width: 80 },
      { label: "CHECK ON 4 SEP", width: CONTENT_W - 80 },
    ],
    [
      ["NFR-01/02", "Automated cross-tenant and SD-06 negatives in CI — blocking for freeze."],
      ["NFR-03", "TLS already; mailbox credentials never returned by API; attachments ≤ 25 MB allowlist (OQ-08)."],
      ["NFR-04", "Existing Supabase MFA retained; SAML out of scope."],
      ["NFR-05", "Record p95 board load; target ≤ 2s / 500 tickets / 200 users — investigate, do not expand scope."],
      ["NFR-07", "99.5% monthly is an ops target, not a build task; document maintenance window."],
      ["NFR-08", "Export/erasure runbook stub for GDPR — full tooling in Wave 2."],
      ["NFR-09", "AuditEvent is P1; until then, do not claim immutable audit."],
      ["NFR-10", "Public form + customer email: keyboard, labels, contrast spot-check (WCAG 2.1 AA)."],
      ["NFR-11", "Structured logs on mail poll, SLA tick, assignment outcome — ticket-id correlator."],
      ["NFR-12", "Confirm daily Supabase backups are on; write restore owner + last test date."],
    ],
  )

  // ── 7. Risks ─────────────────────────────────────────────────────────────
  h1(doc, "7.  Risks, HITL and dependencies")
  table(
    doc,
    [
      { label: "ID", width: 36 },
      { label: "RISK", width: 160 },
      { label: "L/I", width: 40 },
      { label: "MITIGATION", width: CONTENT_W - 236 },
    ],
    [
      ["R1", "Phase 1 RBAC rewrite breaks existing access", "H/H", "Backfill first; resolver parity tests vs legacy tables; cutover behind a short dual-read; HITL on 01/03."],
      ["R2", "Phase 2 board/numbering breaks every ticket path", "H/H", "Keep Team tables; hide Projects (D-05) rather than DROP; dual-write reference; 04/06 HITL."],
      ["R3", "Shared live DB — bad migration", "M/H", "Additive SQL only; strip drift DROPs; no migrate reset; apply off peak; reviewer required."],
      ["R4", "HITL wait stalls the critical path", "H/M", "Book review slots Wed+Fri 11:00. If reviewer absent, A parks HITL and continues AFK tests."],
      ["R5", "Mailbox/DNS (A-01, D-01)", "M/H", "Reuse existing inbound domain; OAuth later (D-10). Threading tested with fixtures, not live customer mail first."],
      ["R6", "Scope creep from [Unconfirmed] / marketplace", "H/M", "D-03 marketplace deferred. Unconfirmed not in P0. Change control: new SRS item = P2 unless it blocks isolation."],
      ["R7", "14 days vs 32 engineer-days", "H/H", "Two engineers. Week 2 GO/NO-GO drops P1. One-engineer fallback: Phases 1–2 + mail/comments only."],
      ["R8", "Test emails hitting real managers", "M/H", "AGENTS.md: do not trigger completion notifications. Use fixture tenants / doNotAssign."],
      ["R9", "NFR-05 missed under real load", "M/M", "Measure on 4 Sep; index/query pass only — no architecture rewrite in-window (NFR-06)."],
      ["R10", "Reopen SLA semantics regress", "L/M", "OQ-03 already decided: resume resolution, fresh first-response. Schema must keep restart/resume/fresh reachable."],
    ],
  )

  h2(doc, "7.1  External dependencies")
  bullet(doc, "A-01  Tenant mailbox + OAuth consent — not required for IMAP/current inbound MVP.")
  bullet(doc, "D-01  SPF/DKIM for custom sender domains — use platform sending domain until DS-07 is confirmed.")
  bullet(doc, "Identity  Supabase + existing Microsoft Entra login; no SAML project in this window (D-12).")
  bullet(doc, "Object storage  existing Supabase Storage for logos and attachments (OQ-08 limits).")
  bullet(doc, "Job runner  SLA ticks, mailbox poll, bulk reassign need a scheduled/queue path (C-05) — use existing Next.js after()/cron; do not introduce a new broker in-window.")

  h2(doc, "7.2  Resolved design decisions that this plan will not reopen")
  para(
    doc,
    "Locked 17 Aug 2026 (§10): self-service portal is a future phase (OQ-01); default footer is an editable fallback (OQ-02); reopen resumes resolution timer + fresh first-response (OQ-03); any agent may escalate (OQ-04); Reopened auto-clears on agent reply (OQ-05); rule actions confirmed (OQ-06); p95 ≤ 2s and 99.5% uptime accepted (OQ-07); attachments ≤ 25 MB with type allowlist (OQ-08). Reopening any of these inside the 19-day window is a schedule defect.",
  )

  // ── 8. Roles ─────────────────────────────────────────────────────────────
  h1(doc, "8.  Roles exercised in the MVP")
  para(
    doc,
    "User-class coverage for 5 Sep. Authority is RoleAssignment at PLATFORM / TENANT / DEPARTMENT / SUB_DEPARTMENT (D-06).",
  )
  table(
    doc,
    [
      { label: "ROLE", width: 120 },
      { label: "MVP BEHAVIOUR BY 5 SEP", width: CONTENT_W - 120 },
    ],
    [
      ["Super Admin", "Create / edit / suspend / soft-delete tenant; restrict user access (SA-01, SA-03). Feature flags and agreement UI are P1."],
      ["Project Admin", "Users + departments in the Support template; assign Department Admins; reporting-only across departments (no ticket bodies) — live dashboard may be a thin volume view; full RPT-06 is P2."],
      ["Department Admin", "Sub-departments, board columns, mailbox, forms, SLA, assignment method, hours, branding, notification templates, first-run walkthrough."],
      ["Sub-dept Manager", "Defaults to Department Admin if unassigned (SD-02). Day-to-day user admin within that sub-department."],
      ["Agent", "Board, claim/assign, reply vs internal note, escalate, transfer (transfer is P1). No access outside granted sub-departments."],
      ["Customer", "Email only. No login. Form URL is unauthenticated (FM-06) with rate-limit (FM-08)."],
    ],
  )

  // ── 9. Wave 2 ────────────────────────────────────────────────────────────
  h1(doc, "9.  Wave 2 — from 8 September")
  para(
    doc,
    "Immediately after release, in this order unless production defects intervene:",
  )
  table(
    doc,
    [
      { label: "ORDER", width: 50 },
      { label: "ITEM", width: 200 },
      { label: "SRS / DECISION", width: CONTENT_W - 250 },
    ],
    [
      ["1", "P1 leftovers (09, 13, 19–21)", "Rules, bulk reassign, flags, audit, agreement"],
      ["2", "18  Reporting + export", "RPT-01–07, D-08 category taxonomy, async CSV/PDF"],
      ["3", "23  Postgres RLS", "D-02 hardening; non-owner role + tenant GUC"],
      ["4", "Mailbox OAuth (EM-05)", "M365 / Google behind the D-10 provider abstraction"],
      ["5", "Template marketplace", "TM-01–04; TM-05 still unconfirmed"],
      ["6", "SA-05 / SA-06", "Tenant summary + renewal reminders — if confirmed"],
      ["7", "SAML/OIDC", "IDP-01 / NFR-04 behind auth abstraction"],
      ["8", "Named portal phase", "OQ-01 — keep ticket read-access portal-ready, no UI now"],
    ],
  )

  h2(doc, "9.1  Explicitly not scheduled")
  bullet(doc, "Billing / invoicing — Agreement is administrative only.")
  bullet(doc, "Any template other than Support (catalogue-only until marketplace wave).")
  bullet(doc, "Native mobile apps; data migration from an incumbent tool.")
  bullet(doc, "AR-01 notification prefs, AR-03 KB, AR-04 auto-escalation on SLA breach, AR-06 merge/split, AR-07 macros, AR-08 CSAT, AR-10 public REST/webhooks, AR-12 localisation.")

  // ── 10. Governance ───────────────────────────────────────────────────────
  h1(doc, "10.  Governance")
  h2(doc, "10.1  Cadence")
  bullet(doc, "Daily 15-minute stand-up: P0 blockers, HITL queue, shared-DB migration planned that day.")
  bullet(doc, "Wed and Fri 11:00 HITL slot: review migrate diff SQL (strip unrelated DROPs) and apply.")
  bullet(doc, "Fri 28 Aug 16:00 GO/NO-GO (M2). Product + engineering. Outcome written into the Wave 2 list.")
  bullet(doc, "Thu 3 Sep 17:00 feature complete review. Fri 4 Sep 12:00 freeze.")

  h2(doc, "10.2  Change control")
  para(
    doc,
    "A new requirement enters this window only if it is required for tenant isolation or for a P0 acceptance criterion already listed. Marketplace, reporting polish, OAuth mailbox, and unconfirmed SA-05/SA-06 are not emergencies. Schema edits follow AGENTS.md; a schema-only change without a migration is a production outage risk (incident 2026-07-29).",
  )

  h2(doc, "10.3  Traceability")
  para(
    doc,
    "Every PR title includes the slice number and primary SRS IDs (e.g. “05: SD-06 sub-department predicate”). QA derives cases from SRS-* IDs; negative cases are mandatory for SD-06, AC-01, SA-03, CM-03 (internal notes never in customer email), and API-04. BRD IDs remain in the SRS traceability matrix (§9 of requirements.md) and are not duplicated here.",
  )

  callout(
    doc,
    "Success on 5 September looks like",
    "A second tenant cannot see the first tenant’s tickets. A sub-department agent cannot see another sub-department’s tickets. A customer email becomes a ticket, an agent reply is emailed back on the same thread, SLA state is visible, and suspending the tenant signs its users out. Projects, sprints and hub are gone from the Support experience. Everything else is written down as Wave 2 — not silently half-shipped.",
    C.greenBg,
    C.green,
  )

  const range = doc.bufferedPageRange()
  const total = range.count
  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i)
    if (i > 0) addRunningFooter(doc, i + 1, total)
  }

  void footer
  void hr
  doc.end()

  stream.on("finish", () => {
    console.log(`Wrote ${OUT} (${total} pages)`)
  })
}

main()
