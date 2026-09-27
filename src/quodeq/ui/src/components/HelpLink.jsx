import { NAV_TAB } from '../vocab/navTab.js';

/** A text button that opens one help section, with any extra params the
 * section reads (e.g. the dimension a figure should open on). Renders
 * nothing when the page has no navigator (tests, embedded previews). */
export default function HelpLink({ onNavigate, section, params = {}, label }) {
  if (!onNavigate) return null;
  return (
    <button type="button" className="help-link" onClick={() => onNavigate(NAV_TAB.HELP, { section, ...params })}>
      {label}
    </button>
  );
}
