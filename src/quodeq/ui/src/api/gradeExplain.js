/**
 * Grade explain API: the scorer's stage values per principle of one
 * dimension in one run, for the "Why this grade" help figure.
 */
import { request } from './request.js';
import { projectPath } from './paths.js';

/** @returns {Promise<{runId: string, dimension: string, params: Object, principles: Array}>} */
export async function getGradeExplain(projectId, runId, dimension) {
  return request(
    `${projectPath(projectId)}/runs/${encodeURIComponent(runId)}/dimensions/${encodeURIComponent(dimension)}/explain`
  );
}
