import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ExplorerStatsPanel from './ExplorerStatsPanel.jsx';

vi.mock('./DimensionScoreHistoryPanel.jsx', () => ({
  default: () => <div data-testid="history-panel" />,
}));

const baseProps = {
  overallScoreNum: 7.5,
  overallGrade: { grade: 'B' },
  allViolations: [{}, {}, {}],
  totalCompliant: 4,
  sev: { critical: 1, major: 2, minor: 0 },
  onSeverityBadge: () => () => {},
  onNavigate: null,
  onCardNavigate: () => {},
  trend: [],
  dimension: 'maintainability',
  activeRunId: 'run-1',
  granularity: 'run',
  onGranularityChange: () => {},
  onBarClick: () => {},
  evalData: {},
  sinceBaseline: undefined,
};

describe('ExplorerStatsPanel severity badges', () => {
  it('renders one badge per non-zero severity, most severe first', () => {
    render(<ExplorerStatsPanel {...baseProps} />);
    const badges = document.querySelectorAll('.acc-eval-sev-row .term-sev-badge');
    expect([...badges].map((b) => b.className)).toEqual([
      'term-sev-badge term-sev-badge--critical term-sev-badge--count-abbr',
      'term-sev-badge term-sev-badge--major term-sev-badge--count-abbr',
    ]);
    expect(badges[0]).toHaveTextContent('1 crit');
    expect(badges[1]).toHaveTextContent('2 maj');
  });

  it('drops the hint entirely when every severity is zero', () => {
    render(<ExplorerStatsPanel {...baseProps} sev={{ critical: 0, major: 0, minor: 0 }} />);
    expect(document.querySelector('.acc-eval-sev-row')).toBeNull();
  });

  it('wires each badge to its own severity when navigation is available', () => {
    const onSeverityBadge = vi.fn(() => () => {});
    render(
      <ExplorerStatsPanel
        {...baseProps}
        sev={{ critical: 1, major: 1, minor: 1 }}
        onNavigate={() => {}}
        onSeverityBadge={onSeverityBadge}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'critical severity' }));
    fireEvent.click(screen.getByRole('button', { name: 'minor severity' }));
    expect(onSeverityBadge.mock.calls.map(([level]) => level)).toEqual(['critical', 'minor']);
  });

  it('leaves badges unclickable when navigation is unavailable', () => {
    render(<ExplorerStatsPanel {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'critical severity' })).toBeNull();
  });

  it('keeps the violations stat clickable with its aria label', () => {
    render(<ExplorerStatsPanel {...baseProps} onNavigate={() => {}} onCardNavigate={vi.fn()} />);
    const stat = screen.getByLabelText(/show all violations/i);
    expect(stat).toBeInTheDocument();
  });

  it('clicking the violations stat fires the navigation callback', () => {
    const onCardNavigate = vi.fn();
    render(<ExplorerStatsPanel {...baseProps} onNavigate={() => {}} onCardNavigate={onCardNavigate} />);
    const stat = screen.getByLabelText(/show all violations/i);
    fireEvent.click(stat);
    expect(onCardNavigate).toHaveBeenCalledWith('violations');
  });
});

describe('ExplorerStatsPanel headline tiles', () => {
  it('tiles read MAJORS, OPEN TYPES, SCORE, DENSITY with coverage', () => {
    render(<ExplorerStatsPanel {...baseProps} evalData={{ filesRead: 50, sourceFileCount: 100 }} allViolations={[{ severity: 'major', req: 'M-A-1' }, { severity: 'minor', req: 'M-B-2' }]} sev={{ critical: 0, major: 1, minor: 1 }} />);
    expect(screen.getAllByText(/^(MAJORS|OPEN TYPES|SCORE|DENSITY)$/).map((n) => n.textContent)).toEqual(['MAJORS', 'OPEN TYPES', 'SCORE', 'DENSITY']);
    expect(screen.getByText('50% coverage')).toBeInTheDocument();
    expect(screen.getByText('4.0')).toBeInTheDocument();
  });

  it('tiles render without sinceBaseline', () => {
    render(<ExplorerStatsPanel {...baseProps} sinceBaseline={undefined} />);
    expect(screen.queryByText(/closed/)).toBeNull();
    expect(screen.getByText('MAJORS')).toBeInTheDocument();
  });

  it('open types closed hint comes from the dimension since-baseline entry', () => {
    const entry = { againstRunId: 'r0', sinceBaseline: { scope: 'all', changedFiles: null, majorsDelta: 0, counts: { new: 0, resolved: 0 }, types: { closed: [], opened: [] } }, all: { majorsDelta: -1, types: { closed: ['M-A-1', 'M-B-2', 'M-C-3'], opened: [] } } };
    render(<ExplorerStatsPanel {...baseProps} sinceBaseline={entry} />);
    expect(screen.getByText('3 closed')).toBeInTheDocument();
  });
});
