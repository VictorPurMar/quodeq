import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SeverityBadgeRow from './SeverityBadgeRow.jsx';

const severity = { critical: 6, major: 939, minor: 1232 };

function badge(container, level) {
  return container.querySelector(`.term-sev-badge--${level}`);
}

describe('SeverityBadgeRow deltas', () => {
  it('mixed directions: criticals up reads bad, majors down reads good, minor has none', () => {
    const { container } = render(<SeverityBadgeRow severity={severity} deltas={{ critical: 1, major: -83 }} />);
    const crit = badge(container, 'critical').querySelector('.term-sev-badge__delta');
    expect(crit).toHaveTextContent('▴1');
    expect(crit.className).toContain('term-sev-badge__delta--bad');
    const maj = badge(container, 'major').querySelector('.term-sev-badge__delta');
    expect(maj).toHaveTextContent('▾83');
    expect(maj.className).toContain('term-sev-badge__delta--good');
    expect(badge(container, 'minor').querySelector('.term-sev-badge__delta')).toBeNull();
  });

  it('no deltas: chips as today', () => {
    const { container } = render(<SeverityBadgeRow severity={severity} />);
    expect(container.querySelectorAll('.term-sev-badge__delta')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });

  it('zero shows no arrow', () => {
    const { container } = render(<SeverityBadgeRow severity={severity} deltas={{ critical: 0, major: -7 }} />);
    expect(badge(container, 'critical').querySelector('.term-sev-badge__delta')).toBeNull();
    expect(badge(container, 'major').querySelector('.term-sev-badge__delta')).toHaveTextContent('▾7');
  });
});
