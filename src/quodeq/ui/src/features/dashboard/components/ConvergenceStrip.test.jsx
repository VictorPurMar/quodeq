import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ConvergenceStrip from './ConvergenceStrip.jsx';

const headline = { majors: 110, critical: 2, openTypes: 134, violations: 1490, filesRead: 2525, sourceFileCount: 2660, density: 7.2, coveragePct: 95 };
const since = { majorsDelta: -3, typesClosed: ['A', 'B'], typesOpened: [], newCount: 25, resolvedCount: 53, scope: 'changed-files', changedFiles: 89, againstRunIds: ['r0'], againstCommitShas: ['0012c73'] };
const runs = [{ runId: 'r1', dateLabel: '27 Sep' }, { runId: 'r0', dateLabel: '26 Sep' }];
const selected = { runId: 'r1', dateLabel: '27 Sep', commitSha: 'b67b319' };

describe('ConvergenceStrip', () => {
  it('criticals are their own number and majors exclude them', () => {
    const { container } = render(<ConvergenceStrip headline={headline} since={since} selectedRun={selected} availableRuns={runs} />);
    expect(container.querySelector('.term-strip__value--critical')).toHaveTextContent('2');
    expect(screen.getByText('108')).toBeInTheDocument();
    expect(screen.getByText('-3')).toBeInTheDocument();
    expect(screen.getByText('2 closed')).toBeInTheDocument();
    expect(screen.getByText('7.2 /100 files')).toBeInTheDocument();
  });

  it('the since line has counts only, never codes', () => {
    render(<ConvergenceStrip headline={headline} since={since} selectedRun={selected} availableRuns={runs} onSeeFindings={() => {}} />);
    expect(screen.getByText(/since 26 Sep · 89 files changed/)).toBeInTheDocument();
    expect(screen.getByText(/new in changed files 25 · resolved 53/)).toBeInTheDocument();
    expect(screen.queryByText(/A, B/)).toBeNull();
    expect(screen.getByRole('button', { name: 'see findings' })).toBeInTheDocument();
  });

  it('no baseline: counts only', () => {
    render(<ConvergenceStrip headline={headline} since={null} selectedRun={selected} availableRuns={runs} />);
    expect(screen.getByText('MAJORS')).toBeInTheDocument();
    expect(screen.queryByText('-3')).toBeNull();
    expect(screen.queryByText(/closed/)).toBeNull();
    expect(screen.queryByText(/since/)).toBeNull();
  });

  it('density without files read is a sentence', () => {
    render(<ConvergenceStrip headline={{ ...headline, density: null, coveragePct: null }} since={null} />);
    expect(screen.getByText('density needs a files-read count: not shown for this run')).toBeInTheDocument();
    expect(screen.queryByText('-')).toBeNull();
  });

  it('every number has a ? that opens Learn more', () => {
    const onLearnMore = vi.fn();
    render(<ConvergenceStrip headline={headline} since={null} onLearnMore={onLearnMore} />);
    const hints = screen.getAllByRole('button', { name: /^About / });
    expect(hints).toHaveLength(4);
    fireEvent.click(hints[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Learn more' }));
    expect(onLearnMore).toHaveBeenCalled();
  });

  it('showSince false renders no since line', () => {
    render(<ConvergenceStrip headline={headline} since={since} showSince={false} />);
    expect(screen.queryByText(/since/)).toBeNull();
    expect(screen.getByText('-3')).toBeInTheDocument();
  });
});
