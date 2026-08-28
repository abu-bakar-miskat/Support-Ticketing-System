import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { parseVisibleWhen } from "@/lib/form-validation";

const OPTIONS_TYPES = new Set(["select", "radio", "checkbox"]);

export function fieldUsesOptions(type: string): boolean {
  return OPTIONS_TYPES.has(type);
}

export async function bumpFormSchemaVersion(formConfigId: string): Promise<void> {
  await prisma.intakeFormConfig.update({
    where: { id: formConfigId },
    data: { schemaVersion: { increment: 1 } },
  });
}

export type FieldSnapshotEntry = {
  id: string;
  label: string;
  type: string;
  isRequired: boolean;
  order: number;
  options: string[];
  childOptions: unknown;
  placeholder: string | null;
  helperText: string | null;
  validation: unknown;
  visibleWhen: unknown;
};

export function snapshotFormFields(
  fields: Array<{
    id: string;
    label: string;
    type: string;
    isRequired: boolean;
    order: number;
    options: string[];
    childOptions: unknown;
    placeholder: string | null;
    helperText: string | null;
    validation: unknown;
    visibleWhen?: unknown;
  }>,
): FieldSnapshotEntry[] {
  return fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    isRequired: f.isRequired,
    order: f.order,
    options: f.options,
    childOptions: f.childOptions,
    placeholder: f.placeholder,
    helperText: f.helperText,
    validation: f.validation,
    visibleWhen: parseVisibleWhen(f.visibleWhen),
  }));
}

export function snapshotAsJson(fields: FieldSnapshotEntry[]): Prisma.InputJsonValue {
  return fields as unknown as Prisma.InputJsonValue;
}
