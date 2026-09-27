import { NAV_TAB } from '../vocab/navTab.js';

/** A text button that opens one help section, or another page when `target`
 * says so, with any extra params the destination reads (e.g. the dimension
 * the grade-formula editor should open on). Renders nothing when the page
 * has no navigator (tests, embedded previews). */
export default function HelpLink({ onNavigate, section, params = {}, label, target = NAV_TAB.HELP }) {
  if (!onNavigate) return null;
  const destination = section ? { section, ...params } : { ...params };
  return (
    <button type="button" className="help-link" onClick={() => onNavigate(target, destination)}>
      {label}
    </button>
  );
}
