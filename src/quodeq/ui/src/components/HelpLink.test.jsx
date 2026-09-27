import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HelpLink from './HelpLink.jsx';
import { NAV_TAB } from '../vocab/navTab.js';
import { HELP_SECTION } from '../vocab/helpSection.js';

describe('HelpLink', () => {
  it('navigates to the help section', () => {
    const onNavigate = vi.fn();
    render(<HelpLink onNavigate={onNavigate} section={HELP_SECTION.WHY_THIS_GRADE} label="why this grade?" />);
    fireEvent.click(screen.getByRole('button', { name: 'why this grade?' }));
    expect(onNavigate).toHaveBeenCalledWith(NAV_TAB.HELP, { section: HELP_SECTION.WHY_THIS_GRADE });
  });

  it('renders nothing without a navigator', () => {
    const { container } = render(<HelpLink section={HELP_SECTION.WHY_THIS_GRADE} label="x" />);
    expect(container.firstChild).toBeNull();
  });

  it('forwards extra params with the section', () => {
    const onNavigate = vi.fn();
    render(<HelpLink onNavigate={onNavigate} section={HELP_SECTION.WHY_THIS_GRADE} params={{ dimension: 'security' }} label="why?" />);
    fireEvent.click(screen.getByRole('button', { name: 'why?' }));
    expect(onNavigate).toHaveBeenCalledWith(NAV_TAB.HELP, { section: HELP_SECTION.WHY_THIS_GRADE, dimension: 'security' });
  });

  it('can target another page, keeping its params', () => {
    const onNavigate = vi.fn();
    render(<HelpLink onNavigate={onNavigate} target={NAV_TAB.GRADE_FORMULA} params={{ dimension: 'security' }} label="why this grade?" />);
    fireEvent.click(screen.getByRole('button', { name: 'why this grade?' }));
    expect(onNavigate).toHaveBeenCalledWith(NAV_TAB.GRADE_FORMULA, { dimension: 'security' });
  });
});
