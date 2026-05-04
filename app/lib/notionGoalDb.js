/**
 * Heuristic: Notion database looks like a “목표 / Goal tracker” DB (스터디 플래너 템플릿 등).
 * Used for auto-select and for showing 목표 연결 온보딩·설정 UI only when such a DB exists.
 */
export function isGoalDatabaseCandidate(db) {
  return /goal|tracker|목표|프로젝트|project|Goal/i.test(String(db?.title || db?.label || ''));
}

export function filterGoalDatabaseCandidates(databases) {
  if (!Array.isArray(databases)) return [];
  return databases.filter(isGoalDatabaseCandidate);
}

/**
 * Show 목표 DB picker & mapping when the workspace likely has a goal DB, or a saved selection still exists in the list.
 */
export function shouldShowGoalDatabaseSection(databases, savedGoalDbId) {
  const fromTitle = filterGoalDatabaseCandidates(databases);
  if (fromTitle.length > 0) return true;
  const id = String(savedGoalDbId || '').trim();
  if (!id) return false;
  return databases.some((d) => d.id === id);
}

/** DBs to show in the goal picker: title-matched candidates, plus the current selection if it is not in that set. */
export function buildGoalDatabasePickerList(databases, selectedGoalDbId) {
  const fromTitle = filterGoalDatabaseCandidates(databases);
  const id = String(selectedGoalDbId || '').trim();
  if (!id) return fromTitle;
  const row = databases.find((d) => d.id === id);
  if (!row) return fromTitle;
  if (fromTitle.some((d) => d.id === id)) return fromTitle;
  return [row, ...fromTitle];
}
