import { NAV_TAB } from '../../vocab/navTab.js';
import { HELP_SECTION } from '../../vocab/helpSection.js';
import { t } from '../../strings/index.js';

/**
 * The "Learn more" a tile's "?" popover offers: the Help page's Overview
 * section. Undefined without a navigator (embedded previews, tests).
 * @param {((tab: string, params: object) => void)|undefined} onNavigate
 * @returns {{label: string, onClick: Function}|undefined}
 */
export function overviewLearnMore(onNavigate) {
  if (!onNavigate) return undefined;
  return { label: t('helpHint.learnMore'), onClick: () => onNavigate(NAV_TAB.HELP, { section: HELP_SECTION.OVERVIEW }) };
}
