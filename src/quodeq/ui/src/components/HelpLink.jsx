import { NAV_TAB } from '../vocab/navTab.js';

/** A text button that opens one help section. Renders nothing when the
 * page has no navigator (tests, embedded previews). */
export default function HelpLink({ onNavigate, section, label }) {
  if (!onNavigate) return null;
  return (
    <button type="button" className="help-link" onClick={() => onNavigate(NAV_TAB.HELP, { section })}>
      {label}
    </button>
  );
}
