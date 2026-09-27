import { createContext, useContext } from 'react';

/** What the help page knows about the reader's project, so a figure can
 * show the reader's own numbers. Empty outside the app shell. */
export const EMPTY_SCOPE = Object.freeze({ project: null, runId: null, dimensions: [], dimension: null });

export const HelpScopeContext = createContext(EMPTY_SCOPE);

/** @returns {{project: string|null, runId: string|null, dimensions: string[], dimension: string|null}} */
export function useHelpScope() {
  return useContext(HelpScopeContext);
}
