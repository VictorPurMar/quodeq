import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RunOverviewPanel from './RunOverviewPanel.jsx';
import { SidePaneProvider } from '../../side-pane/index.js';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';

const dim = { dimension: 'maintainability', overallScore: '8.6', overallGrade: 'Good', filesRead: 100, sourceFileCount: 100,
  totals: { violationCount: 12, complianceCount: 30, severity: { critical: 1, major: 2, minor: 9 } }, violations: [{ req: 'M-A-1', file: 'a.py', line: 1, severity: 'major' }] };
const since = { maintainability: { againstRunId: 'r0', againstCommitSha: 'abc',
  sinceBaseline: { scope: 'all', changedFiles: null, majorsDelta: -1, counts: { new: 2, resolved: 3 }, types: { closed: ['M-B-2'], opened: [] } },
  all: { majorsDelta: -1, counts: { new: 2, resolved: 3 }, types: { closed: ['M-B-2'], opened: [] } } } };
const dashboard = { dimensions: [dim], trend: [], partialRuns: [], selectedRun: { runId: 'r1', dateLabel: '27 Sep' }, sinceBaseline: since };
const runs = [{ runId: 'r1', dateLabel: '27 Sep' }, { runId: 'r0', dateLabel: '26 Sep' }];

function mount(selectedSource) {
  const QC = withQueryClient();
  return render(
    <QC><ApiProvider value={{}}><SidePaneProvider>
      <RunOverviewPanel dashboard={dashboard} selectedRunId="r1" selectedProject="p" selectedSource={selectedSource} projectName="p" availableRuns={runs} onNavigate={() => {}} />
    </SidePaneProvider></ApiProvider></QC>,
  );
}

describe('RunOverviewPanel convergence strip', () => {
  it('renders the strip under the hero with the run numbers and the since line', () => {
    mount(PROJECT_SOURCE.LOCAL);
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText('1 closed')).toBeInTheDocument();
    expect(screen.getByText(/since 26 Sep/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'see findings' })).toBeInTheDocument();
    expect(screen.queryByText('SINCE BASELINE')).toBeNull();
  });

  it('shared project: no see findings', () => {
    mount(PROJECT_SOURCE.SHARED);
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'see findings' })).toBeNull();
  });
});
