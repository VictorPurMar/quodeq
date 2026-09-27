import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RatioDensityStat, ratioDisplay } from './heroSectionParts.jsx';

describe('RatioDensityStat', () => {
  it('density half with its own label, one decimal and a "?"', () => {
    const { container } = render(<RatioDensityStat ratio="1:0.9" density={20.24} />);
    expect(screen.getByText('RATIO')).toBeInTheDocument();
    expect(screen.getByText('1:0.9')).toBeInTheDocument();
    expect(screen.getByText('violations : compliance')).toBeInTheDocument();
    expect(screen.getByText('DENSITY')).toBeInTheDocument();
    expect(screen.getByText('20.2')).toBeInTheDocument();
    expect(screen.getByText('findings /100 files read')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About DENSITY' })).toBeInTheDocument();
    expect(container.querySelectorAll('.term-stat__half')).toHaveLength(2);
  });

  it('no density: ratio alone, no dash', () => {
    const { container } = render(<RatioDensityStat ratio="1:0.9" density={null} />);
    expect(screen.getByText('RATIO')).toBeInTheDocument();
    expect(screen.queryByText('DENSITY')).not.toBeInTheDocument();
    expect(container.querySelector('.term-stat--pair')).toBeNull();
    expect(container.textContent).not.toMatch(/(^|\s)[-—](\s|$)/);
  });

  it('ratioDisplay reads 0:N without violations, never a dash', () => {
    expect(ratioDisplay(0, 1922)).toBe('0:1922');
    expect(ratioDisplay(2177, 1922)).toBe('1:0.9');
  });
});
