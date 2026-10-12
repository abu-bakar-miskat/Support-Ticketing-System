import { statusCategory } from "@/lib/status-category";
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  isReplaceableStatusSet,
  remapStatusLabels,
  type OperationTemplate,
} from "@/lib/operation-templates";
import { listSavedBoards, resolveOperation } from "@/lib/saved-boards";
import { listSavedFeatures } from "@/lib/saved-features";
import { templateIdFromGrantToken } from "@/lib/template-features";

/**
 * The operation template this department last turned on, if any.
 * Later grants win, so switching from Sales to Finance follows Finance.
 */
export async function operationTemplateForDepartment(
  departmentId: string,
): Promise<OperationTemplate | null> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { featureKeys: true },
  });
  if (!Array.isArray(dept?.featureKeys)) return null;
  const ids = dept.featureKeys
    .map(templateIdFromGrantToken)
    .filter((id): id is string => id !== null);
  if (ids.length === 0) return null;
  const templates = await prisma.template.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  const slugById = new Map(templates.map((template) => [template.id, template.slug]));
  const savedFeatures = await listSavedFeatures();
  let found: OperationTemplate | null = null;
  for (const value of dept.featureKeys) {
    const id = templateIdFromGrantToken(value);
    const slug = id ? slugById.get(id) : null;
    const feature = slug ? savedFeatures.find((item) => item.id === slug && item.statuses.length >= 2) : null;
    if (feature) {
      found = {
        slug: feature.id,
        name: feature.name,
        useCase: feature.useCase || feature.explanation,
        featureKeys: [feature.key],
        statuses: feature.statuses,
        lists: feature.lists,
      };
      continue;
    }
    const operation = await resolveOperation(slug);
    if (operation) found = operation;
  }
  return found;
}

/**
 * Give every sub-department in this department the operation's board.
 * A board that still has the default columns, or another operation's columns,
 * is replaced and its tickets move across by column position. A board someone
 * has edited by hand is left alone.
 */
export async function applyOperationBoard(
  tx: Prisma.TransactionClient,
  departmentId: string,
  slug: string,
): Promise<void> {
  const savedFeatures = await listSavedFeatures();
  const featureTemplate = savedFeatures.find((feature) => feature.id === slug && feature.statuses.length >= 2);
  const operation = featureTemplate ? null : await resolveOperation(slug);
  const effective = featureTemplate
    ? { statuses: featureTemplate.statuses, lists: featureTemplate.lists }
    : operation;
  if (!effective) return;
  const saved = await listSavedBoards();
  const nextLabels = effective.statuses.map((status) => status.label);
  const featureBoards = new Set(
    savedFeatures
      .filter((feature) => feature.statuses.length >= 2)
      .map((feature) => feature.statuses.map((status) => status.label).join("\n")),
  );
  const subs = await tx.subDepartment.findMany({
    where: { departmentId },
    select: { id: true, statuses: { select: { label: true, order: true } } },
  });
  for (const sub of subs) {
    const current = [...sub.statuses].sort((a, b) => a.order - b.order);
    const currentLabels = current.map((status) => status.label);
    if (currentLabels.join("\n") === nextLabels.join("\n")) continue;
    const matchesSaved = saved.some(
      (board) => board.statuses.map((status) => status.label).join("\n") === currentLabels.join("\n"),
    );
    const matchesFeature = featureBoards.has(currentLabels.join("\n"));
    // Enabling a saved feature template is an explicit choice, so it replaces the board.
    if (
      !featureTemplate &&
      currentLabels.length > 0 &&
      !isReplaceableStatusSet(currentLabels) &&
      !matchesSaved &&
      !matchesFeature
    ) {
      continue;
    }

    const remap = remapStatusLabels(currentLabels, nextLabels);
    for (const [from, to] of remap) {
      if (from === to) continue;
      await tx.ticket.updateMany({
        where: { subDepartmentId: sub.id, status: from },
        data: { status: to },
      });
    }
    if (nextLabels.length > 0) {
      await tx.ticket.updateMany({
        where: { subDepartmentId: sub.id, status: { notIn: nextLabels } },
        data: { status: nextLabels[0]! },
      });
    }
    if (currentLabels.length > 0) {
      await tx.subDepartmentStatus.deleteMany({ where: { subDepartmentId: sub.id } });
    }
    await tx.subDepartmentStatus.createMany({
      data: effective.statuses.map((status) => ({ ...status, category: statusCategory(status), isComplete: statusCategory(status) === "COMPLETE", subDepartmentId: sub.id })),
    });
  }
}
