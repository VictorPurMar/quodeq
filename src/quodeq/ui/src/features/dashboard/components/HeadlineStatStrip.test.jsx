import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import HeadlineStatStrip, { HeadlineFooter } from './HeadlineStatStrip.jsx';

const headline = { majors: 3, critical: 0, openTypes: 37, violations: 1738, filesRead: 2525, sourceFileCount: 2660, density: 68.8, coveragePct: 95 };
const since = { majorsDelta: -2, typesClosed: ['M-MDF-1', 'M-ANA-1'], typesOpened: [], newCount: 4, resolvedCount: 7, scope: 'changed-files', changedFiles: 12, againstRunIds: ['r0'], againstCommitShas: ['c9b5370'] };
const footer = (over = {}) => ({
  violations: 1738, compliance: 2207, ratio: '1:1', severity: { critical: 0, major: 3, minor: 1735 }, suppressed: 0,
  handleViolations: vi.fn(), handleCompliance: vi.fn(), handleSeverity: vi.fn(),
  violationsAriaKey: 'overview.showRunViolationsAria', complianceAriaKey: 'overview.showRunComplianceAria', ...over,
});

describe('HeadlineStatStrip', () => {
  it('shows the four tiles in order with the since-baseline hints', () => {
    render(<HeadlineStatStrip headline={headline} since={since} score={{ display: '9.0', hint: 'grade E' }} />);
    const labels = screen.getAllByText(/^(MAJORS|OPEN TYPES|SCORE|DENSITY)$/).map((n) => n.textContent);
    expect(labels).toEqual(['MAJORS', 'OPEN TYPES', 'SCORE', 'DENSITY']);
    expect(screen.getByText('-2')).toBeInTheDocument();
    expect(screen.getByText('2 closed')).toBeInTheDocument();
    expect(screen.getByText('95% coverage')).toBeInTheDocument();
    expect(screen.getByText('68.8')).toBeInTheDocument();
  });

  it('without a baseline shows no delta and no closed hint', () => {
    render(<HeadlineStatStrip headline={headline} since={null} score={{ display: '9.0', hint: null }} />);
    expect(screen.queryByText(/closed/)).toBeNull();
    expect(screen.queryByText('-2')).toBeNull();
  });

  it('majors delta reads lower-is-better', () => {
    const { container } = render(<HeadlineStatStrip headline={headline} since={since} score={{ display: '9.0' }} />);
    expect(container.querySelector('.trend-badge-up')).not.toBeNull();
  });

  it('density shows a dash when nothing was read', () => {
    render(<HeadlineStatStrip headline={{ ...headline, density: null, coveragePct: null }} since={null} score={{ display: '9.0' }} />);
    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.getByText('per 100 files read')).toBeInTheDocument();
  });
});

describe('HeadlineFooter', () => {
  it('keeps the raw violations count clickable and the suppressed note', () => {
    const f = footer({ suppressed: 12 });
    render(<HeadlineFooter footer={f} />);
    fireEvent.click(screen.getByRole('button', { name: /violations/i }));
    expect(f.handleViolations).toHaveBeenCalled();
    expect(screen.getByText(/12 suppressed/)).toBeInTheDocument();
    expect(screen.getByText('1738')).toBeInTheDocument();
  });
});
