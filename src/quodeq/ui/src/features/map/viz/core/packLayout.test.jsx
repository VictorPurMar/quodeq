import { describe, it, expect } from 'vitest';
import { buildPackRoot, packInPlace, slimTree, applyPositions, handlePackMessage } from './packLayout.js';
import { MAP_VIEW_MODE } from '../../mapVocab.js';

const FIXTURE = {
  name: '/', path: '', isFile: false, violations: 6, compliance: 2, severity: {},
  children: [
    { name: 'a', path: 'a', isFile: false, violations: 4, compliance: 1, severity: {}, children: [
      { name: 'a1.py', path: 'a/a1.py', isFile: true, violations: 3, compliance: 0, severity: {} },
      { name: 'a2.py', path: 'a/a2.py', isFile: true, violations: 1, compliance: 1, severity: {} },
    ] },
    { name: 'b.py', path: 'b.py', isFile: true, violations: 2, compliance: 1, severity: {} },
  ],
};

describe('pack layout: worker path matches the render-thread path', () => {
  it.each(Object.values(MAP_VIEW_MODE))('in %s mode', (mode) => {
    const sync = packInPlace(buildPackRoot(FIXTURE, mode));
    const viaWorker = buildPackRoot(FIXTURE, mode);
    const { id, xyr } = handlePackMessage({ id: 7, slim: slimTree(viaWorker) });
    applyPositions(viaWorker, xyr);

    expect(id).toBe(7);
    const pos = (root) => root.descendants().map((n) => [n.data.path, n.x, n.y, n.r]);
    expect(pos(viaWorker)).toEqual(pos(sync));
  });

  it('slim trees carry no file data', () => {
    const slim = slimTree(buildPackRoot(FIXTURE, MAP_VIEW_MODE.HEALTH));
    expect(JSON.stringify(slim)).not.toContain('a1.py');
    expect(Object.keys(slim).sort()).toEqual(['c', 'v']);
  });
});
