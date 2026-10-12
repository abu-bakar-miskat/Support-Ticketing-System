import { isCompleteStatus, isStatusCategory, inferStatusCategory } from "@/lib/status-category";
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  operationTemplateBySlug,
  OPERATION_TEMPLATES,
  type OperationList,
  type OperationStatus,
  type OperationTemplate,
} from "@/lib/operation-templates";
import {
  MARKETPLACE_FEATURE_KEYS,
  isMarketplaceFeatureKey,
  type MarketplaceFeatureKey,
} from "@/lib/template-features";
import { emptyFeatureSetup, parseFeatureSetup, type FeatureSetup } from "@/lib/feature-setup";
import { listSavedFeatures } from "@/lib/saved-features";

const SETTING_KEY = "savedBoards";

export type SavedBoard = {
  slug: string;
  name: string;
  useCase: string;
  group: string;
  featureKeys: MarketplaceFeatureKey[];
  statuses: OperationStatus[];
  lists: OperationList[];
  setup: FeatureSetup;
};

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `board-${base || "custom"}`;
}

export function parseSavedBoards(value: unknown): SavedBoard[] {
  if (!Array.isArray(value)) return [];
  const boards: SavedBoard[] = [];
  for (const row of value) {
    const board = parseBoard(row);
    if (board) boards.push(board);
  }
  return boards;
}

function parseBoard(value: unknown): SavedBoard | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.slug !== "string" || typeof row.name !== "string") return null;
  const featureKeys = Array.isArray(row.featureKeys)
    ? row.featureKeys.filter(isMarketplaceFeatureKey)
    : [];
  const statuses = parseStatuses(row.statuses);
  if (statuses.length < 2 || !statuses.some((status) => isCompleteStatus(status))) return null;
  return {
    slug: row.slug,
    name: row.name.trim(),
    useCase: typeof row.useCase === "string" ? row.useCase.trim() : "",
    group: typeof row.group === "string" && row.group.trim() ? row.group.trim() : "Operations",
    featureKeys: featureKeys.length > 0 ? featureKeys : ["board"],
    statuses,
    lists: parseLists(row.lists, statuses),
    setup: parseFeatureSetup(row.setup),
  };
}

function parseStatuses(value: unknown): OperationStatus[] {
  if (!Array.isArray(value)) return [];
  const statuses: OperationStatus[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const status = row as Record<string, unknown>;
    const label = typeof status.label === "string" ? status.label.trim() : "";
    const color = typeof status.color === "string" && /^#[0-9a-fA-F]{6}$/.test(status.color) ? status.color : "#64748b";
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    const category = isStatusCategory(status.category) ? status.category : inferStatusCategory({ label, order: statuses.length, isComplete: status.isComplete === true });
    statuses.push({
      category,
      label,
      color,
      order: statuses.length,
      isComplete: category === "COMPLETE",
    });
  }
  return statuses;
}

function parseLists(value: unknown, statuses: OperationStatus[]): OperationList[] {
  const labels = new Set(statuses.map((status) => status.label));
  if (!Array.isArray(value)) return [];
  const lists: OperationList[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const list = row as Record<string, unknown>;
    const name = typeof list.name === "string" ? list.name.trim() : "";
    if (!name) continue;
    const picked = Array.isArray(list.statuses)
      ? list.statuses.filter((status): status is string => typeof status === "string" && labels.has(status))
      : [];
    if (picked.length === 0) continue;
    lists.push({ name, statuses: picked });
  }
  return lists;
}

export async function listSavedBoards(): Promise<SavedBoard[]> {
  const row = await prisma.platformSetting.findUnique({ where: { key: SETTING_KEY } });
  return parseSavedBoards(row?.value);
}

/** Built-in boards, with any super-admin save laid over them, then custom boards. */
export async function listEditableBoards(): Promise<SavedBoard[]> {
  const saved = await listSavedBoards();
  const bySlug = new Map(saved.map((board) => [board.slug, board]));
  const builtins = OPERATION_TEMPLATES.map((operation) => bySlug.get(operation.slug) ?? boardFromOperation(operation));
  const custom = saved.filter((board) => !operationTemplateBySlug(board.slug));
  return [...builtins, ...custom];
}

export function boardFromOperation(operation: OperationTemplate): SavedBoard {
  return {
    slug: operation.slug,
    name: operation.name,
    useCase: operation.useCase,
    group: operation.group?.trim() || "Operations",
    featureKeys: operation.featureKeys.filter(isMarketplaceFeatureKey),
    statuses: operation.statuses,
    lists: operation.lists,
    setup: operation.setup ?? emptyFeatureSetup(),
  };
}

export function mergeBoard(slug: string, saved: SavedBoard[]): OperationTemplate | null {
  const custom = saved.find((board) => board.slug === slug);
  if (custom) return toOperation(custom);
  const builtin = operationTemplateBySlug(slug);
  if (!builtin) return null;
  return { ...builtin, group: builtin.group ?? "Operations", setup: builtin.setup ?? emptyFeatureSetup() };
}

export async function resolveOperation(slug: string | null | undefined): Promise<OperationTemplate | null> {
  if (!slug) return null;
  const saved = await listSavedBoards();
  return mergeBoard(slug, saved);
}

export function toOperation(board: SavedBoard): OperationTemplate {
  return {
    slug: board.slug,
    name: board.name,
    useCase: board.useCase,
    group: board.group,
    featureKeys: board.featureKeys,
    statuses: board.statuses,
    lists: board.lists,
    setup: board.setup,
  };
}

export function validateBoardInput(input: unknown, existingSlugs: string[]): SavedBoard {
  const row = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!name) throw new Error("A template needs a name");
  const featureKeys = (Array.isArray(row.featureKeys) ? row.featureKeys : []).filter(isMarketplaceFeatureKey);
  if (featureKeys.length === 0) throw new Error("Choose at least one feature");
  const needsStatuses = featureKeys.includes("board") || featureKeys.includes("workflows");
  const statuses = parseStatuses(row.statuses);
  if (needsStatuses && statuses.length < 2) throw new Error("Add at least two statuses");
  if (needsStatuses && !statuses.some((status) => isCompleteStatus(status))) throw new Error("Choose Complete for at least one status");
  const requestedSlug = typeof row.slug === "string" ? row.slug.trim() : "";
  let slug = requestedSlug;
  if (!slug) {
    slug = slugify(name);
    let n = 2;
    while (existingSlugs.includes(slug)) {
      slug = `${slugify(name)}-${n}`;
      n += 1;
    }
  }
  return {
    slug,
    name,
    useCase: typeof row.useCase === "string" ? row.useCase.trim() : "",
    group: typeof row.group === "string" && row.group.trim() ? row.group.trim() : "Operations",
    featureKeys: MARKETPLACE_FEATURE_KEYS.filter((key) => featureKeys.includes(key)),
    statuses: statuses.length >= 2 ? statuses : parseStatuses([
      { label: "To do", color: "#64748b", isComplete: false },
      { label: "Done", color: "#16a34a", isComplete: true },
    ]),
    lists: parseLists(row.lists, statuses),
    setup: parseFeatureSetup(row.setup),
  };
}

/** Save a board and publish it as a marketplace template departments can request. */
export async function saveBoard(input: unknown, actorId: string): Promise<SavedBoard> {
  const saved = await listSavedBoards();
  const board = validateBoardInput(input, saved.map((row) => row.slug));
  const next = saved.some((row) => row.slug === board.slug)
    ? saved.map((row) => (row.slug === board.slug ? board : row))
    : [...saved, board];
  await prisma.platformSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: next as never, updatedById: actorId },
    update: { value: next as never, updatedById: actorId },
  });
  await publishBoardTemplate(board, actorId);
  return board;
}

export async function resetBoard(slug: string, actorId: string): Promise<void> {
  const saved = await listSavedBoards();
  const next = saved.filter((board) => board.slug !== slug);
  await prisma.platformSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: next as never, updatedById: actorId },
    update: { value: next as never, updatedById: actorId },
  });
  const builtin = operationTemplateBySlug(slug);
  if (builtin) {
    await publishBoardTemplate(boardFromOperation(builtin), actorId);
    return;
  }
  await prisma.template.updateMany({ where: { slug }, data: { isActive: false } });
}

async function publishBoardTemplate(board: SavedBoard, actorId: string) {
  const existing = await prisma.template.findUnique({ where: { slug: board.slug }, select: { id: true } });
  const template = existing
    ? await prisma.template.update({
        where: { id: existing.id },
        data: { name: board.name, description: board.useCase, isActive: true },
      })
    : await prisma.template.create({
        data: {
          name: board.name,
          slug: board.slug,
          description: board.useCase,
          createdById: actorId,
        },
      });
  await prisma.templateFeature.deleteMany({ where: { templateId: template.id } });
  await prisma.templateFeature.createMany({
    data: board.featureKeys.map((key) => ({ templateId: template.id, key })),
  });
}

/**
 * Seed a department with this template's options for the features just turned on.
 * Existing tags, policies, templates, forms, hours, and assignment choices are left alone.
 */
export async function applyTemplateFeatureSetup(
  tx: Prisma.TransactionClient,
  params: {
    departmentId: string;
    tenantId: string;
    actorId: string;
    slug: string;
    featureKeys: readonly string[];
  },
): Promise<void> {
  const operation = await resolveOperation(params.slug);
  const setup = operation?.setup ?? emptyFeatureSetup();
  const saved = await listSavedFeatures();
  const featureTemplate = saved.find((feature) => feature.id === params.slug);
  const reflect = featureTemplate != null;
  const keys = new Set(featureTemplate ? [featureTemplate.key] : params.featureKeys);
  const tags = featureTemplate?.key === "tagsLabels" ? featureTemplate.tags : setup.tags;
  const sla = featureTemplate?.key === "slaPolicies" ? featureTemplate.sla : setup.sla;
  const ticketTemplates = featureTemplate?.key === "ticketTemplates" ? featureTemplate.ticketTemplates : setup.ticketTemplates;
  const assignmentMethod = featureTemplate?.key === "assignmentMethods" ? featureTemplate.assignmentMethod : setup.assignmentMethod;
  const calendar = featureTemplate?.key === "calendar" ? featureTemplate.calendar : setup.calendar;
  const supportForm = featureTemplate?.key === "supportForm" ? featureTemplate.supportForm : setup.supportForm;

  if (keys.has("tagsLabels") && tags.length > 0) {
    if (reflect) {
      for (const tag of tags) {
        const existing = await tx.label.findFirst({
          where: { departmentId: params.departmentId, name: tag.name },
          select: { id: true },
        });
        if (existing) {
          await tx.label.update({ where: { id: existing.id }, data: { color: tag.color } });
        } else {
          await tx.label.create({ data: { name: tag.name, color: tag.color, departmentId: params.departmentId } });
        }
      }
    } else {
      const existing = await tx.label.count({ where: { departmentId: params.departmentId } });
      if (existing === 0) {
        await tx.label.createMany({
          data: tags.map((tag) => ({ name: tag.name, color: tag.color, departmentId: params.departmentId })),
          skipDuplicates: true,
        });
      }
    }
  }

  if (keys.has("slaPolicies") && sla.length > 0) {
    if (reflect) {
      for (const [order, policy] of sla.entries()) {
        const existing = await tx.slaPolicy.findFirst({
          where: { departmentId: params.departmentId, name: policy.name },
          select: { id: true },
        });
        if (existing) {
          await tx.slaPolicy.update({
            where: { id: existing.id },
            data: { firstResponseMins: policy.firstResponseMins, resolutionMins: policy.resolutionMins, enabled: true },
          });
        } else {
          await tx.slaPolicy.create({
            data: {
              tenantId: params.tenantId,
              departmentId: params.departmentId,
              name: policy.name,
              conditions: { combinator: "AND", conditions: [] },
              firstResponseMins: policy.firstResponseMins,
              resolutionMins: policy.resolutionMins,
              order,
            },
          });
        }
      }
    } else {
      const existing = await tx.slaPolicy.count({ where: { departmentId: params.departmentId } });
      if (existing === 0) {
        await tx.slaPolicy.createMany({
          data: sla.map((policy, order) => ({
            tenantId: params.tenantId,
            departmentId: params.departmentId,
            name: policy.name,
            conditions: { combinator: "AND", conditions: [] },
            firstResponseMins: policy.firstResponseMins,
            resolutionMins: policy.resolutionMins,
            order,
          })),
        });
      }
    }
  }

  if (keys.has("ticketTemplates") && ticketTemplates.length > 0) {
    if (reflect) {
      for (const template of ticketTemplates) {
        const existing = await tx.ticketTemplate.findFirst({
          where: { departmentId: params.departmentId, name: template.name },
          select: { id: true },
        });
        const customFields = template.fields.map((label, index) => ({ id: `field-${index + 1}`, label, type: "text" }));
        if (existing) {
          await tx.ticketTemplate.update({ where: { id: existing.id }, data: { customFields } });
        } else {
          await tx.ticketTemplate.create({
            data: {
              name: template.name,
              departmentId: params.departmentId,
              createdById: params.actorId,
              customFields,
            },
          });
        }
      }
    } else {
      const existing = await tx.ticketTemplate.count({ where: { departmentId: params.departmentId } });
      if (existing === 0) {
        for (const template of ticketTemplates) {
          await tx.ticketTemplate.create({
            data: {
              name: template.name,
              departmentId: params.departmentId,
              createdById: params.actorId,
              customFields: template.fields.map((label, index) => ({ id: `field-${index + 1}`, label, type: "text" })),
            },
          });
        }
      }
    }
  }

  if (keys.has("assignmentMethods")) {
    const department = await tx.department.findUnique({
      where: { id: params.departmentId },
      select: { assignmentMethod: true },
    });
    if (reflect || (department?.assignmentMethod === "ROUND_ROBIN" && assignmentMethod !== "ROUND_ROBIN")) {
      if (department && department.assignmentMethod !== assignmentMethod) {
        await tx.department.update({
          where: { id: params.departmentId },
          data: { assignmentMethod },
        });
      }
    }
  }

  if (keys.has("calendar")) {
    const department = await tx.department.findUnique({
      where: { id: params.departmentId },
      select: { businessHours: true },
    });
    if (department && (reflect || department.businessHours == null)) {
      const current = department.businessHours as { timezone?: string } | null;
      await tx.department.update({
        where: { id: params.departmentId },
        data: {
          businessHours: {
            timezone: current?.timezone || "UTC",
            workingDays: calendar.workingDays,
            workStartTime: calendar.start,
            workEndTime: calendar.end,
          },
        },
      });
    }
  }

  if (keys.has("supportForm") && (supportForm.name || supportForm.fields.length > 0)) {
    const name = supportForm.name || "Request form";
    const named = reflect
      ? await tx.intakeFormConfig.findFirst({
          where: { departmentId: params.departmentId, name },
          select: { id: true },
        })
      : null;
    const existing = reflect ? (named ? 1 : 0) : await tx.intakeFormConfig.count({ where: { departmentId: params.departmentId } });
    if (existing === 0) {
      await tx.intakeFormConfig.create({
        data: {
          name,
          departmentId: params.departmentId,
          fields: {
            create: supportForm.fields.map((field, order) => ({
              label: field.label,
              type: "text",
              isRequired: field.required,
              order,
            })),
          },
        },
      });
    }
  }
}
