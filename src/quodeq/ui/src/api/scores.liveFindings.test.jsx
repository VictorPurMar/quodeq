import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./request.js', () => ({ request: vi.fn().mockResolvedValue({}) }));

import { request } from './request.js';
import { getLiveFindings } from './scores.js';

describe('getLiveFindings since query', () => {
  beforeEach(() => request.mockClear());

  it('omits since on the first request', async () => {
    await getLiveFindings('proj', 'run-1', ['security', 'usability']);
    expect(request).toHaveBeenCalledWith(
      '/projects/proj/runs/run-1/live-findings?dimensions=security%2Cusability',
    );
  });

  it('sends only the dimensions with rows already held', async () => {
    await getLiveFindings('proj', 'run-1', ['security', 'usability'], { security: 3, usability: 0 });
    expect(request).toHaveBeenCalledWith(
      '/projects/proj/runs/run-1/live-findings?dimensions=security%2Cusability&since=security%3A3',
    );
  });
});
