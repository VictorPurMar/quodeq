import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import { useSeeFindings } from './useSeeFindings.js';
import { NAV_TAB } from '../../../vocab/navTab.js';

const since = { scope: 'changed-files', newCount: 3 };
const diff = { dimensions: {
  maintainability: { sinceBaseline: { new: [{ req: 'M-A-1', file: 'a.py', line: 1, severity: 'minor', principle: 'P' }, { req: 'M-A-1', file: 'b.py', line: 2, severity: 'major', principle: 'P' }] } },
  security: { sinceBaseline: { new: [{ req: 'S-1', file: 'c.py', line: 3, severity: 'critical', principle: 'Q' }] } },
} };

function Probe({ onNavigate, project = 'p' }) {
  const { seeFindings } = useSeeFindings({ project, runId: 'r1', dateLabel: '26 Sep', since, onNavigate });
  return seeFindings ? <button type="button" onClick={seeFindings}>see</button> : <span>none</span>;
}

describe('useSeeFindings', () => {
  it('opens the file page on the new findings of the scoped diff', async () => {
    const onNavigate = vi.fn();
    render(<ApiProvider value={{ getRunDiff: async () => diff }}><Probe onNavigate={onNavigate} /></ApiProvider>);
    fireEvent.click(screen.getByText('see'));
    await waitFor(() => expect(onNavigate).toHaveBeenCalled());
    const [tab, params] = onNavigate.mock.calls[0];
    expect(tab).toBe(NAV_TAB.FILE);
    expect(params.file.total).toBe(3);
    expect(params.file.file).toBe('new in changed files (3)');
    expect(params.runId).toBe('r1');
    expect(params.sourceTab).toBe(NAV_TAB.OVERVIEW);
  });

  it('is undefined without a project or run', () => {
    render(<ApiProvider value={{}}><Probe onNavigate={() => {}} project={null} /></ApiProvider>);
    expect(screen.getByText('none')).toBeTruthy();
  });
});
