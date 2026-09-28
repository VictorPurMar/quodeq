import { useCallback, useRef, useState } from 'react';
import { confirmDialog } from '../../../utils/confirmDialog.js';
import { t } from '../../../strings/index.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import { useSidePane } from '../../side-pane/SidePaneContext.jsx';
import { EXTERNAL_JOB_PREFIX, isExternalJobId } from '../../../vocab/jobStatus.js';
import { DIALOG_VARIANT } from '../../../vocab/dialogVariant.js';

/**
 * HistoryPage.jsx's run-delete handler. `deletingRunId` is the run whose
 * DELETE is in flight, so the row can show it; a second click on that row
 * is ignored, deletes of other rows are not. A failed delete surfaces
 * through the side pane's toast, like every other mutation failure.
 *
 * @returns {{handleDeleteRun: (runId: string, dateLabel?: string) => Promise<void>, deletingRunId: string | null}}
 */
export function useHistoryDeleteRun({ selectedSource, deleteEvaluation, onRunDeleted }) {
  const { showToast } = useSidePane();
  const [deletingRunId, setDeletingRunId] = useState(null);
  // The ids in flight. The state above is the one the table highlights
  // (the latest); the ref is what blocks a duplicate request.
  const inFlight = useRef(new Set());

  const handleDeleteRun = useCallback(async (runId, dateLabel) => {
    // Defense in depth: shared-repo runs have no delete route on the backend
    // (mutation is local-only by design, same as dismiss/restore/verify). The
    // real gate is the wiring (onDeleteRun is undefined when source is
    // 'shared', so the row never renders a delete button), but this early
    // return covers any caller that reaches the handler directly.
    if (selectedSource !== PROJECT_SOURCE.LOCAL) return;
    if (inFlight.current.has(runId)) return;
    const label = dateLabel || runId;
    const ok = await confirmDialog({
      title: t('history.deleteRunConfirmTitle'),
      message: t('history.deleteRunConfirmMsg', { label }),
      confirmLabel: t('violations.delete'),
      cancelLabel: t('history.keep'),
      variant: DIALOG_VARIANT.DANGER,
    });
    if (!ok) return;
    const jobId = isExternalJobId(runId) ? runId : `${EXTERNAL_JOB_PREFIX}${runId}`;
    inFlight.current.add(runId);
    setDeletingRunId(runId);
    try {
      await deleteEvaluation(jobId);
    } catch (err) {
      showToast(t('history.deleteRunFailed', { message: err.message || t('history.unknownError') }));
      return;
    } finally {
      inFlight.current.delete(runId);
      setDeletingRunId((current) => (current === runId ? null : current));
    }
    onRunDeleted?.(runId);
  }, [selectedSource, deleteEvaluation, onRunDeleted, showToast]);

  return { handleDeleteRun, deletingRunId };
}
