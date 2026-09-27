/**
 * What the FORMULA tab's right column shows for the picked principle: the
 * stage rows under the saved parameters, the rows under the draft once the
 * server has computed them, or one note when there are no rows to show.
 */
import { stageSummary } from './stageRows.js';
import { STAGE_STATUS } from '../../../vocab/stageStatus.js';
import { t } from '../../../strings/index.js';

/**
 * The principle to show: the picked one when the run has it, else the first
 * graded principle, else the first one at all.
 * @param {Array<{principleId: string, insufficient: boolean}>} principles
 * @param {string|null} picked
 * @returns {string|null}
 */
export function pickPrincipleId(principles, picked) {
  if (picked && principles.some((p) => p.principleId === picked)) return picked;
  const first = principles.find((p) => !p.insufficient) || principles[0];
  return first ? first.principleId : null;
}

function principleOf(payload, principleId) {
  return payload?.principles?.find((p) => p.principleId === principleId) || null;
}

function rowsOf(payload, principleId) {
  const principle = principleOf(payload, principleId);
  return principle ? stageSummary(principle, payload.params).rows : null;
}

/**
 * @param {{stored: object|null, live: object|null, status: string}} explain - useStageExplain's result
 * @param {string|null} principleId
 * @returns {{stored: Array|null, live: Array|null, note: string|null}}
 */
export function liveStages(explain, principleId) {
  if (explain.status === STAGE_STATUS.UNAVAILABLE || !explain.stored) {
    const note = explain.status === STAGE_STATUS.LOADING ? t('gradeFormula.liveLoading') : t('gradeFormula.liveNoRun');
    return { stored: null, live: null, note };
  }
  const stored = rowsOf(explain.stored, principleId);
  if (!stored) {
    const note = principleId ? t('gradeFormula.liveInsufficient', { principle: principleId }) : t('gradeFormula.liveNoRun');
    return { stored: null, live: null, note };
  }
  return { stored, live: rowsOf(explain.live, principleId), note: null };
}
