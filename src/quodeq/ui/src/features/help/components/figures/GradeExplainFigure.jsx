/**
 * The "Why this grade" worked example: one principle of the reader's own
 * run, each scoring stage with its value and the parameter that moves it.
 * The arithmetic is the Python scorer's (explain endpoint), not a copy.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../../api/ApiContext.jsx';
import { projectKeys } from '../../../../api/queryKeys.js';
import { useHelpScope } from '../helpScope.js';
import { stageRows } from '../../../grade-formula/stages/stageRows.js';
import { t } from '../../../../strings/index.js';

function useExplain(project, runId, dimension) {
  const api = useApi();
  return useQuery({
    queryKey: projectKeys.gradeExplain(project, runId, dimension),
    queryFn: () => api.getGradeExplain(project, runId, dimension),
    enabled: Boolean(project && runId && dimension),
    staleTime: Infinity,
  });
}

function Note({ textKey }) {
  return <p className="gf-explain__note">{t(textKey)}</p>;
}

function StageRows({ rows }) {
  return (
    <ol className="gf-explain__stages">
      {rows.map((r) => (
        <li key={r.key} className="gf-explain__stage">
          <span className="gf-explain__label">{r.label}</span>
          <span className="gf-explain__value">{r.value}</span>
          {r.param && (
            <span className="gf-explain__param">{t('helpFigure.movedBy', { param: r.param, value: r.paramValue, tab: r.tab })}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function PrincipleBody({ principle, params }) {
  if (principle.insufficient) {
    return <p className="gf-explain__note">{t('helpFigure.explainInsufficient', { principle: principle.principleId, findings: principle.findings, compliance: principle.compliance })}</p>;
  }
  return <StageRows rows={stageRows(principle.stages, params)} />;
}

function Picker({ id, labelKey, options, value, onChange }) {
  return (
    <label className="gf-explain__picker" htmlFor={id}>
      {t(labelKey)}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

/** The dimension the figure opens on: the one the reader came from when the
 * run has it (matched without case), else the run's first. */
function initialDimension(scope) {
  const wanted = String(scope.dimension || '').toLowerCase();
  return scope.dimensions.find((d) => d.toLowerCase() === wanted) || scope.dimensions[0] || '';
}

/** The rows for the loaded data, or the note that stands in for them. */
function Body({ query, principleId, onPrinciple }) {
  if (query.isPending) return <Note textKey="helpFigure.explainLoading" />;
  if (query.isError || !query.data) return <Note textKey="helpFigure.explainFailed" />;
  const principles = query.data.principles;
  const graded = principles.find((p) => !p.insufficient) || principles[0];
  const current = principles.find((p) => p.principleId === principleId) || graded;
  if (!current) return <Note textKey="helpFigure.explainFailed" />;
  return (
    <>
      <Picker id="gf-explain-principle" labelKey="helpFigure.explainPrinciple" options={principles.map((p) => p.principleId)} value={current.principleId} onChange={onPrinciple} />
      <PrincipleBody principle={current} params={query.data.params} />
    </>
  );
}

export default function GradeExplainFigure() {
  const scope = useHelpScope();
  const [dimension, setDimension] = useState(() => initialDimension(scope));
  const [principleId, setPrincipleId] = useState('');
  const query = useExplain(scope.project, scope.runId, dimension);
  if (!scope.project || !scope.runId || !dimension) return <Note textKey="helpFigure.explainNoProject" />;
  return (
    <div className="gf-explain">
      <div className="gf-explain__pickers">
        <Picker id="gf-explain-dim" labelKey="helpFigure.explainDimension" options={scope.dimensions} value={dimension} onChange={(v) => { setDimension(v); setPrincipleId(''); }} />
      </div>
      <Body query={query} principleId={principleId} onPrinciple={setPrincipleId} />
    </div>
  );
}
