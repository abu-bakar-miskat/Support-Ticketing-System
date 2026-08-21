import "server-only";
import { prisma } from "@/lib/db";
import { planRules, type Rule, type FormValues } from "@/lib/rules-engine";
import { getEligibleMembers } from "@/lib/rota";
import { createNotification } from "@/lib/notify";
import type { NotificationType } from "@/generated/prisma/enums";

/**
 * Unified per-department automation rules executor (slice 09, RE-01/02).
 *
 * Runs a department's enabled rules (in order) against a ticket's submitted form
 * values and applies the fired actions to an already-created ticket. Runs AFTER
 * creation as a best-effort post-step: it overrides/augments the ticket, so if
 * no rule assigns an agent the existing auto-assignment stands (safe rollout).
 * Never throws — a rule/action failure must never block ticket creation.
 */

const PRIORITIES = new Set(["Low", "Medium", "High", "Critical", "Urgent"]);
const CATEGORIES = new Set([
  "Bug",
  "FeatureRequest",
  "Question",
  "TechnicalIssue",
  "AccountAccess",
  "Billing",
  "Other",
]);
const NOTIFICATION_TYPES = new Set<string>([
  "mention",
  "assignment",
  "status_change",
  "review_request",
  "sla_at_risk",
  "sla_breach",
]);

export type RuleTicketContext = {
  id: string;
  tenantId: string;
  departmentId: string;
  subDepartmentId: string;
  assigneeId: string | null;
};

export type RuleExecutionResult = { assigned: boolean; firedCount: number };

async function pickGroupAssignee(
  subDepartmentId: string,
  excludeUserId: string | null,
): Promise<string | null> {
  const eligible = await getEligibleMembers(subDepartmentId, excludeUserId);
  return eligible[0]?.userId ?? null;
}

export async function applyRulesToTicket(
  ticket: RuleTicketContext,
  formValues: FormValues,
): Promise<RuleExecutionResult> {
  try {
    const rows = await prisma.rule.findMany({
      // Department-wide rules (subDepartmentId = null) apply to every ticket;
      // a sub-department's own rules apply additionally to its tickets.
      where: {
        departmentId: ticket.departmentId,
        enabled: true,
        OR: [{ subDepartmentId: null }, { subDepartmentId: ticket.subDepartmentId }],
      },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        conditions: true,
        actions: true,
        order: true,
        enabled: true,
        stopProcessing: true,
      },
    });
    if (rows.length === 0) return { assigned: false, firedCount: 0 };

    const rules: Rule[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      order: r.order,
      enabled: r.enabled,
      stopProcessing: r.stopProcessing,
      conditions: r.conditions as Rule["conditions"],
      actions: r.actions as Rule["actions"],
    }));

    const plan = planRules(rules, formValues);
    if (plan.firedActions.length === 0) return { assigned: false, firedCount: 0 };

    const data: Record<string, unknown> = {};
    const tagsToAdd: string[] = [];
    const notifications: { recipientId: string; type: NotificationType; message?: string }[] = [];
    let slaPolicyId: string | null = null;
    let assigned = false;

    for (const action of plan.firedActions) {
      const p = (action.params ?? {}) as Record<string, unknown>;
      switch (action.type) {
        case "assign_agent":
          if (typeof p.agentId === "string" && p.agentId) {
            data.assigneeId = p.agentId;
            assigned = true;
          }
          break;
        case "assign_group": {
          const groupId =
            typeof p.subDepartmentId === "string"
              ? p.subDepartmentId
              : typeof p.teamId === "string"
                ? p.teamId
                : null;
          if (groupId) {
            const member = await pickGroupAssignee(groupId, ticket.assigneeId);
            if (member) {
              data.assigneeId = member;
              assigned = true;
            }
          }
          break;
        }
        case "set_priority":
          if (typeof p.priority === "string" && PRIORITIES.has(p.priority)) data.priority = p.priority;
          break;
        case "set_category":
          if (typeof p.category === "string" && CATEGORIES.has(p.category)) data.category = p.category;
          break;
        case "set_tag": {
          const tag = typeof p.tag === "string" ? p.tag : typeof p.label === "string" ? p.label : null;
          if (tag) tagsToAdd.push(tag);
          break;
        }
        case "change_column":
          // The board groups tickets by `status`, so setting status is the move.
          if (typeof p.status === "string" && p.status) {
            data.status = p.status;
          }
          break;
        case "apply_sla":
          if (typeof p.slaPolicyId === "string" && p.slaPolicyId) slaPolicyId = p.slaPolicyId;
          break;
        case "send_notification": {
          const recipientId = typeof p.recipientId === "string" ? p.recipientId : null;
          const rawType = typeof p.notificationType === "string" ? p.notificationType : "mention";
          const type = (NOTIFICATION_TYPES.has(rawType) ? rawType : "mention") as NotificationType;
          const message = typeof p.message === "string" ? p.message : undefined;
          if (recipientId) notifications.push({ recipientId, type, message });
          break;
        }
      }
    }

    if (tagsToAdd.length > 0) data.labels = { push: tagsToAdd };

    if (Object.keys(data).length > 0) {
      await prisma.ticket.update({ where: { id: ticket.id }, data });
    }

    if (slaPolicyId) {
      const policy = await prisma.slaPolicy.findFirst({
        where: { id: slaPolicyId, departmentId: ticket.departmentId },
        select: { id: true, firstResponseMins: true, resolutionMins: true },
      });
      if (policy) {
        const now = new Date();
        await prisma.slaTimer.upsert({
          where: { ticketId: ticket.id },
          create: {
            ticketId: ticket.id,
            tenantId: ticket.tenantId,
            policyId: policy.id,
            firstResponseTargetMins: policy.firstResponseMins,
            resolutionTargetMins: policy.resolutionMins,
            firstResponseStartedAt: now,
            resolutionStartedAt: now,
          },
          update: {
            policyId: policy.id,
            firstResponseTargetMins: policy.firstResponseMins,
            resolutionTargetMins: policy.resolutionMins,
          },
        });
      }
    }

    for (const n of notifications) {
      createNotification({
        recipientId: n.recipientId,
        type: n.type,
        ticketId: ticket.id,
        message: n.message,
      }).catch(() => undefined);
    }

    return { assigned, firedCount: plan.firedActions.length };
  } catch (e) {
    console.error("[rule-executor] applyRulesToTicket failed:", e);
    return { assigned: false, firedCount: 0 };
  }
}
