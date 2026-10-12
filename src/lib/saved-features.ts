import { isCompleteStatus } from "@/lib/status-category";
import { isStatusCategory, inferStatusCategory } from "@/lib/status-category";
import "server-only";
import { prisma } from "@/lib/db";
import { DEFAULT_FEATURE_TEMPLATES } from "@/lib/default-feature-templates";
import { emptyFeatureSetup, parseFeatureSetup, type SavedFeature } from "@/lib/feature-setup";
import { TEMPLATE_FEATURE_LABELS, isMarketplaceFeatureKey, templateGrantToken } from "@/lib/template-features";

const SETTING_KEY = "savedFeatures";

export async function listSavedFeatures(): Promise<SavedFeature[]> {
  const row = await prisma.platformSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!Array.isArray(row?.value)) return [];
  const features: SavedFeature[] = [];
  for (const item of row.value) {
    const feature = parseSavedFeature(item);
    if (feature) features.push(feature);
  }
  return features;
}

export function validateFeatureInput(input: unknown, existingIds: string[]): SavedFeature {
  const row = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (!isMarketplaceFeatureKey(row.key)) throw new Error("That isn't a feature you can customize");
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!name) throw new Error("A template needs a name");
  const setup = parseFeatureSetup(row);
  const statuses = parseStatuses(row.statuses);
  const needsStatuses = row.key === "board" || row.key === "workflows";
  if (needsStatuses && statuses.length < 2) throw new Error("Add at least two statuses");
  if (needsStatuses && !statuses.some((status) => isCompleteStatus(status))) throw new Error("Choose Complete for at least one status");
  const requestedId = typeof row.id === "string" ? row.id.trim() : "";
  return {
    id: requestedId || nextId(row.key, name, existingIds),
    name,
    key: row.key,
    explanation: typeof row.explanation === "string" ? row.explanation.trim() : "",
    useCase: typeof row.useCase === "string" ? row.useCase.trim() : "",
    statuses,
    lists: parseLists(row.lists, statuses),
    tags: setup.tags,
    ticketTemplates: setup.ticketTemplates,
    sla: setup.sla,
    assignmentMethod: setup.assignmentMethod,
    supportForm: setup.supportForm,
    calendar: setup.calendar,
    reportsPeriodDays: setup.reportsPeriodDays,
  };
}

/** Creates the starter templates that are not already saved or previously removed. */
export async function ensureDefaultFeatureTemplates(actorId: string): Promise<void> {
  const saved = await listSavedFeatures();
  const savedIds = new Set(saved.map((feature) => feature.id));
  const existing = await prisma.template.findMany({
    where: { slug: { in: DEFAULT_FEATURE_TEMPLATES.map((feature) => feature.id) } },
    select: { slug: true },
  });
  const known = new Set(existing.map((row) => row.slug));
  const toAdd = DEFAULT_FEATURE_TEMPLATES.filter((feature) => !savedIds.has(feature.id) && !known.has(feature.id));
  if (toAdd.length > 0) {
    await prisma.platformSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value: [...saved, ...toAdd] as never, updatedById: actorId },
      update: { value: [...saved, ...toAdd] as never, updatedById: actorId },
    });
    for (const feature of toAdd) await publishFeatureTemplate(feature, actorId);
  }
  for (const feature of saved) {
    if (DEFAULT_FEATURE_TEMPLATES.some((item) => item.id === feature.id) && !known.has(feature.id)) {
      await publishFeatureTemplate(feature, actorId);
    }
  }
}

export async function saveFeature(input: unknown, actorId: string): Promise<SavedFeature> {
  const saved = await listSavedFeatures();
  const feature = validateFeatureInput(input, saved.map((row) => row.id));
  const next = saved.some((row) => row.id === feature.id)
    ? saved.map((row) => (row.id === feature.id ? feature : row))
    : [...saved, feature];
  await prisma.platformSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: next as never, updatedById: actorId },
    update: { value: next as never, updatedById: actorId },
  });
  const templateId = await publishFeatureTemplate(feature, actorId);
  await reflectFeatureTemplate(feature, templateId, actorId);
  return feature;
}

export async function resetFeature(id: string, actorId: string): Promise<void> {
  const saved = await listSavedFeatures();
  if (!saved.some((feature) => feature.id === id)) throw new Error("That template was not found");
  const next = saved.filter((feature) => feature.id !== id);
  await prisma.platformSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: next as never, updatedById: actorId },
    update: { value: next as never, updatedById: actorId },
  });
  await prisma.template.updateMany({ where: { slug: id }, data: { isActive: false } });
}

function nextId(key: string, name: string, existingIds: string[]): string {
  const base = `ft-${key}-${slugify(name)}`.slice(0, 56);
  let id = base;
  let n = 2;
  while (existingIds.includes(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return base || "template";
}

async function reflectFeatureTemplate(feature: SavedFeature, templateId: string, actorId: string) {
  const departments = await prisma.department.findMany({
    where: { featureKeys: { array_contains: templateGrantToken(templateId) } },
    select: { id: true, tenantId: true },
  });
  if (departments.length === 0) return;
  const { applyOperationBoard } = await import("@/lib/operation-board");
  const { applyTemplateFeatureSetup } = await import("@/lib/saved-boards");
  for (const department of departments) {
    await prisma.$transaction(async (tx) => {
      if (feature.statuses.length >= 2) await applyOperationBoard(tx, department.id, feature.id);
      await applyTemplateFeatureSetup(tx, {
        departmentId: department.id,
        tenantId: department.tenantId,
        actorId,
        slug: feature.id,
        featureKeys: [feature.key],
      });
    });
  }
}

async function publishFeatureTemplate(feature: SavedFeature, actorId: string): Promise<string> {
  const description = feature.useCase || feature.explanation || null;
  const template = await prisma.template.upsert({
    where: { slug: feature.id },
    create: {
      name: feature.name,
      slug: feature.id,
      description,
      createdById: actorId,
    },
    update: { name: feature.name, description, isActive: true },
  });
  await prisma.templateFeature.deleteMany({ where: { templateId: template.id, key: { not: feature.key } } });
  await prisma.templateFeature.createMany({
    data: [{ templateId: template.id, key: feature.key }],
    skipDuplicates: true,
  });
  return template.id;
}

function parseSavedFeature(value: unknown): SavedFeature | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!isMarketplaceFeatureKey(row.key)) return null;
  const setup = parseFeatureSetup(row);
  const base = emptyFeatureSetup();
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : TEMPLATE_FEATURE_LABELS[row.key];
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `ft-${row.key}`;
  return {
    id,
    name,
    key: row.key,
    explanation: typeof row.explanation === "string" ? row.explanation.trim() : "",
    useCase: typeof row.useCase === "string" ? row.useCase.trim() : "",
    statuses: parseStatuses(row.statuses),
    lists: parseLists(row.lists, parseStatuses(row.statuses)),
    tags: setup.tags,
    ticketTemplates: setup.ticketTemplates,
    sla: setup.sla,
    assignmentMethod: setup.assignmentMethod ?? base.assignmentMethod,
    supportForm: setup.supportForm,
    calendar: setup.calendar,
    reportsPeriodDays: setup.reportsPeriodDays,
  };
}

function parseStatuses(value: unknown): SavedFeature["statuses"] {
  if (!Array.isArray(value)) return [];
  const statuses: SavedFeature["statuses"] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const status = row as Record<string, unknown>;
    const label = typeof status.label === "string" ? status.label.trim() : "";
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    const color = typeof status.color === "string" && /^#[0-9a-fA-F]{6}$/.test(status.color) ? status.color : "#64748b";
    const category = isStatusCategory(status.category) ? status.category : inferStatusCategory({ label, order: statuses.length, isComplete: status.isComplete === true });
    statuses.push({ label, color, order: statuses.length, category, isComplete: category === "COMPLETE" });
  }
  return statuses;
}

function parseLists(value: unknown, statuses: SavedFeature["statuses"]): SavedFeature["lists"] {
  const labels = new Set(statuses.map((status) => status.label));
  if (!Array.isArray(value)) return [];
  const lists: SavedFeature["lists"] = [];
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
