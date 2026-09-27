import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '../../../../api/ApiContext.jsx';
import { HelpScopeContext } from '../helpScope.js';
import GradeExplainFigure from './GradeExplainFigure.jsx';

const payload = {
  runId: 'r1', dimension: 'maintainability',
  params: { severityWeight: { critical: 4, major: 1.5, minor: 0.25 }, baseK: 0.12, liftCompress: 1.8, ceilScale: 0.5, floorMinor: 8, floorMajor: 5, gradeThresholds: [[9, 'Exemplary'], [7, 'Good'], [5, 'Adequate'], [3, 'Poor']] },
  principles: [
    { principleId: 'Analyzability', findings: 12, compliance: 30, insufficient: false, stages: { types: { critical: 0, major: 1, minor: 3 }, complianceTypes: 4, weightedViolations: 2.25, base: 7.87, lift: 0.36, raw: 8.64, ceiling: 9.16, floor: 5, final: 8.6, grade: 'Good' } },
    { principleId: 'Testability', findings: 1, compliance: 0, insufficient: true, stages: null },
  ],
};

function mount(scope, api) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApiProvider value={api}>
        <HelpScopeContext.Provider value={scope}>
          <GradeExplainFigure />
        </HelpScopeContext.Provider>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

describe('GradeExplainFigure', () => {
  it('asks for a project when there is none', () => {
    const { container } = mount({ project: null, runId: null, dimensions: [] }, {});
    expect(screen.getByText(/Open a project with a finished run/)).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\x28/);
  });

  it('renders the stages of the first graded principle', async () => {
    mount({ project: 'p', runId: 'r1', dimensions: ['maintainability'] }, { getGradeExplain: async () => payload });
    expect(await screen.findByText('8.6 Good')).toBeInTheDocument();
    expect(screen.getByText(/0 critical, 1 major, 3 minor = 2.25/)).toBeInTheDocument();
    expect(screen.getByText(/strictness K = 0.12/)).toBeInTheDocument();
  });

  it('insufficient principle renders the note', async () => {
    mount({ project: 'p', runId: 'r1', dimensions: ['maintainability'] }, { getGradeExplain: async () => payload });
    await screen.findByText('8.6 Good');
    fireEvent.change(screen.getByLabelText('Principle'), { target: { value: 'Testability' } });
    expect(screen.getByText(/too little evidence to grade/)).toBeInTheDocument();
  });

  it('says so when the run cannot be read', async () => {
    mount({ project: 'p', runId: 'r1', dimensions: ['maintainability'] }, { getGradeExplain: async () => { throw new Error('boom'); } });
    expect(await screen.findByText('The run could not be read.')).toBeInTheDocument();
  });

  it('keeps the dimension picker when the first dimension cannot be read', async () => {
    mount({ project: 'p', runId: 'r1', dimensions: ['flexibility', 'maintainability'] }, { getGradeExplain: async () => { throw new Error('boom'); } });
    expect(await screen.findByText('The run could not be read.')).toBeInTheDocument();
    expect(screen.getByLabelText('Dimension')).toBeInTheDocument();
  });

  it('opens on the dimension the reader came from, whatever its case', async () => {
    const calls = [];
    const api = { getGradeExplain: async (project, runId, dimension) => { calls.push(dimension); return { ...payload, dimension }; } };
    mount({ project: 'p', runId: 'r1', dimensions: ['security', 'maintainability'], dimension: 'Maintainability' }, api);
    await screen.findByText('8.6 Good');
    expect(calls).toEqual(['maintainability']);
  });
});
