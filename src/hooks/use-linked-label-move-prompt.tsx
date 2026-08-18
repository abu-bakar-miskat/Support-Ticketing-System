"use client";

import { useCallback, useMemo, useState } from "react";
import { LabelChoiceModal } from "@/components/tickets/label-choice-modal";
import { useLabels } from "@/hooks/queries/use-labels";
import type { SubDepartmentStatusConfig } from "@/components/board/board-types";
import {
  buildLinkedLabelOptions,
  statusHasLinkedLabels,
  chosenLabelForApi,
  hasLinkedLabelSelection,
} from "@/lib/status-label-choice";

type PendingMove = { dbId: string; toStatus: string };

type Options = {
  resolveStatusesForCard: (subDepartmentId: string) => SubDepartmentStatusConfig[];
  getCardSubDepartmentId: (dbId: string) => string | undefined;
  onMove: (dbId: string, toStatus: string, chosenLabel?: string) => void;
};

/** Intercepts board drag-drops onto statuses with linked labels and shows the picker modal. */
export function useLinkedLabelMovePrompt({
  resolveStatusesForCard,
  getCardSubDepartmentId,
  onMove,
}: Options) {
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: departmentLabels = [], isLoading: labelsLoading } = useLabels();

  const tryMove = useCallback(
    (dbId: string, toStatus: string) => {
      const subDepartmentId = getCardSubDepartmentId(dbId);
      const statuses = subDepartmentId ? resolveStatusesForCard(subDepartmentId) : [];
      const target = statuses.find((s) => s.label === toStatus);
      if (statusHasLinkedLabels(target?.allowedLabels)) {
        setPending({ dbId, toStatus });
        setChosen(null);
        return;
      }
      onMove(dbId, toStatus);
    },
    [getCardSubDepartmentId, resolveStatusesForCard, onMove],
  );

  const pendingTarget = useMemo(() => {
    if (!pending) return null;
    const subDepartmentId = getCardSubDepartmentId(pending.dbId);
    const statuses = subDepartmentId ? resolveStatusesForCard(subDepartmentId) : [];
    return statuses.find((s) => s.label === pending.toStatus) ?? null;
  }, [pending, getCardSubDepartmentId, resolveStatusesForCard]);

  const pendingLabelOptions = useMemo(
    () => buildLinkedLabelOptions(pendingTarget?.allowedLabels, departmentLabels),
    [pendingTarget, departmentLabels],
  );

  const cancel = useCallback(() => {
    setPending(null);
    setChosen(null);
  }, []);

  const confirm = useCallback(() => {
    if (!pending || !hasLinkedLabelSelection(chosen)) return;
    setSaving(true);
    const { dbId, toStatus } = pending;
    const label = chosenLabelForApi(chosen);
    setPending(null);
    setChosen(null);
    onMove(dbId, toStatus, label);
    setSaving(false);
  }, [pending, chosen, onMove]);

  const modal = (
    <LabelChoiceModal
      open={!!pending}
      statusLabel={pending?.toStatus ?? null}
      options={pendingLabelOptions}
      chosen={chosen}
      saving={saving}
      loading={labelsLoading && pendingLabelOptions.length === 0}
      onChoose={setChosen}
      onCancel={cancel}
      onConfirm={confirm}
    />
  );

  return { tryMove, modal };
}
