import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RatioDensityStat, ratioDisplay } from './heroSectionParts.jsx';

describe('RatioDensityStat', () => {
  it('ratio is the number; density is the tile\'s second hint line, one decimal, no "?"', () => {
    const { container } = render(<RatioDensityStat ratio="1:3" density={12.64} />);
    expect(screen.getByText('RATIO')).toBeInTheDocument();
    expect(screen.getByText('1:3')).toBeInTheDocument();
    expect(screen.getByText('violations : compliance')).toBeInTheDocument();
    expect(screen.getByText('12.6')).toBeInTheDocument();
    expect(screen.getByText(/violations : 100 files/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.term-stat__hint-line')).toHaveLength(2);
  });

  it('no density: ratio alone, no dash', () => {
    const { container } = render(<RatioDensityStat ratio="1:3" density={null} />);
    expect(screen.getByText('RATIO')).toBeInTheDocument();
    expect(container.querySelectorAll('.term-stat__hint-line')).toHaveLength(1);
    expect(container.textContent).not.toMatch(/(^|\s)[-—](\s|$)/);
  });

  it('ratioDisplay reads 0:N without violations, never a dash', () => {
    expect(ratioDisplay(0, 1922)).toBe('0:1922');
    expect(ratioDisplay(2177, 1922)).toBe('1:1');
  });
});
