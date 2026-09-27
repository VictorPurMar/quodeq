/**
 * One line per scoring stage, with the value and the formula parameter that
 * moves it: the worked example beside the grade-formula sliders.
 */
import { t } from '../../../strings/index.js';

const ONE_DECIMAL = 1;
const TWO_DECIMALS = 2;

function num(v, decimals = ONE_DECIMAL) {
  return typeof v === 'number' ? v.toFixed(decimals) : '-';
}

function joined(values) {
  return values.map((v) => String(v)).join(' / ');
}

/**
 * @param {Object} stages the explain endpoint's stage block
 * @param {Object} params the endpoint's params (camelCase)
 * @returns {Array<{key: string, label: string, value: string, param: string|null, paramValue: string|null, tab: string}>}
 */
export function stageRows(stages, params) {
  const w = params.severityWeight || {};
  return [
    { key: 'types', label: t('helpFigure.stageTypes'),
      value: t('helpFigure.stageTypesValue', { ...stages.types, weighted: num(stages.weightedViolations, TWO_DECIMALS) }),
      param: t('helpFigure.paramSeverityWeights'), paramValue: joined([w.critical, w.major, w.minor]), tab: t('helpFigure.tabSeverity') },
    { key: 'base', label: t('helpFigure.stageBase'), value: num(stages.base),
      param: t('helpFigure.paramBaseK'), paramValue: String(params.baseK), tab: t('helpFigure.tabCurve') },
    { key: 'lift', label: t('helpFigure.stageLift'),
      value: t('helpFigure.stageLiftValue', { types: stages.complianceTypes, lift: num(stages.lift, TWO_DECIMALS) }),
      param: t('helpFigure.paramLiftCompress'), paramValue: String(params.liftCompress), tab: t('helpFigure.tabCurve') },
    { key: 'raw', label: t('helpFigure.stageRaw'), value: num(stages.raw), param: null, paramValue: null, tab: '' },
    { key: 'ceiling', label: t('helpFigure.stageCeiling'), value: num(stages.ceiling),
      param: t('helpFigure.paramCeilScale'), paramValue: String(params.ceilScale), tab: t('helpFigure.tabCurve') },
    { key: 'floor', label: t('helpFigure.stageFloor'), value: num(stages.floor),
      param: t('helpFigure.paramFloors'), paramValue: joined([params.floorMinor, params.floorMajor]), tab: t('helpFigure.tabBoundaries') },
    { key: 'final', label: t('helpFigure.stageFinal'), value: t('helpFigure.stageFinalValue', { score: num(stages.final), grade: stages.grade }),
      param: t('helpFigure.paramThresholds'), paramValue: joined((params.gradeThresholds || []).map(([v]) => v)), tab: t('helpFigure.tabBoundaries') },
  ];
}

/**
 * The rows and the final "score grade" of one principle of the explain
 * payload, or nulls when the scorer found it insufficient.
 * @param {{insufficient: boolean, stages: Object|null}} principle
 * @param {Object} params the payload's params (camelCase)
 * @returns {{insufficient: boolean, rows: Array|null, final: string|null}}
 */
export function stageSummary(principle, params) {
  if (!principle || principle.insufficient || !principle.stages) {
    return { insufficient: true, rows: null, final: null };
  }
  const rows = stageRows(principle.stages, params);
  return { insufficient: false, rows, final: rows[rows.length - 1].value };
}
