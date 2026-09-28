// Mirror of src/quodeq/core/types/dashboard_view.py:DashboardView. Which shape
// of the dashboard payload to fetch: `full` carries every dimension's bodies
// (run-detail views), `overview` leaves them out. Wire value (`?view=`) and
// the trailing dashboard cache-key segment (api/queryKeys.js).
export const DASHBOARD_VIEW = Object.freeze({ FULL: 'full', OVERVIEW: 'overview' });
