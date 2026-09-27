import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SinceBaselinePanel, { baselineDateLabel } from './SinceBaselinePanel.jsx';

const runs = [{ runId: 'r1', dateLabel: '26 Sep' }, { runId: 'r0', dateLabel: '20 Sep' }];
const selected = { runId: 'r1', dateLabel: '26 Sep', commitSha: 'ab00c6b11deadbeef' };
const since = (over = {}) => ({
  majorsDelta: -2, typesClosed: ['M-MDF-1', 'M-ANA-1'], typesOpened: [], newCount: 4, resolvedCount: 7,
  scope: 'changed-files', changedFiles: 12, againstRunIds: ['r0'], againstCommitShas: ['c9b5370abcdef'], ...over,
});

describe('SinceBaselinePanel', () => {
  it('renders nothing without a baseline', () => {
    const { container } = render(<SinceBaselinePanel since={null} selectedRun={selected} availableRuns={runs} />);
    expect(container.firstChild).toBeNull();
  });

  it('names both runs, the short shas, the file count and the scoped counts', () => {
    render(<SinceBaselinePanel since={since()} selectedRun={selected} availableRuns={runs} />);
    expect(screen.getByText(/run 20 Sep \(c9b5370\) to 26 Sep \(ab00c6b\)/)).toBeInTheDocument();
    expect(screen.getByText(/12 files changed/)).toBeInTheDocument();
    expect(screen.getByText(/majors -2/)).toBeInTheDocument();
    expect(screen.getByText(/types closed M-MDF-1, M-ANA-1/)).toBeInTheDocument();
    expect(screen.getByText(/types opened none/)).toBeInTheDocument();
    expect(screen.getByText(/new in changed files 4/)).toBeInTheDocument();
    expect(screen.getByText(/resolved 7/)).toBeInTheDocument();
  });

  it('says in all files when the scope is all', () => {
    render(<SinceBaselinePanel since={since({ scope: 'all', changedFiles: null })} selectedRun={selected} availableRuns={runs} />);
    expect(screen.getByText(/in all files \(no commit recorded/)).toBeInTheDocument();
    expect(screen.getByText(/new in all files 4/)).toBeInTheDocument();
  });

  it('reports mixed baselines by count', () => {
    render(<SinceBaselinePanel since={since({ scope: 'mixed', againstRunIds: ['r0', 'rX'], changedFiles: null })} selectedRun={selected} availableRuns={runs} />);
    expect(screen.getByText(/against 2 baseline runs/)).toBeInTheDocument();
    expect(screen.getByText(/in all files \(baselines differ per dimension\)/)).toBeInTheDocument();
    expect(screen.queryByText(/no commit recorded/)).toBeNull();
  });

  it('shows the empty state on an unchanged tree', () => {
    render(<SinceBaselinePanel since={since({ majorsDelta: 0, typesClosed: [], typesOpened: [], newCount: 0, resolvedCount: 0, changedFiles: 0 })} selectedRun={selected} availableRuns={runs} />);
    expect(screen.getByText('No changes since 20 Sep. Same commit, same majors, no types closed or opened.')).toBeInTheDocument();
    expect(screen.queryByText(/resolved/)).toBeNull();
  });
});

describe('baselineDateLabel', () => {
  it('is the baseline run date under one baseline, null otherwise', () => {
    expect(baselineDateLabel(since(), runs)).toBe('20 Sep');
    expect(baselineDateLabel(since({ scope: 'mixed', againstRunIds: ['r0', 'rX'] }), runs)).toBeNull();
    expect(baselineDateLabel(null, runs)).toBeNull();
  });
});
