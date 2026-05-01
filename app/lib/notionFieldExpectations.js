/** Expected Notion property types per app field (integration keys). */
export const TODO_FIELD_EXPECTED_TYPES = {
  // 할 일 "이름"은 Notion `title` 전용(텍스트 rich_text는 유형 불일치로 경고)
  name: ['title'],
  date: ['date'],
  done: ['checkbox', 'status'],
  accum: ['number', 'formula', 'rollup'],
  dailyReport: ['relation'],
  goal: ['relation'],
  timeBlocking: ['rich_text'],
};

export const REPORT_FIELD_EXPECTED_TYPES = {
  date: ['date'],
  // 하루 리뷰는 본문 텍스트(rich_text). 제목(title)이면 유형 불일치로 경고
  review: ['rich_text'],
  totalMin: ['number', 'formula', 'rollup'],
  todoList: ['relation'],
};

/** Goal Tracker DB — query filters by status/select option label (see /api/goals). */
export const GOAL_FIELD_EXPECTED_TYPES = {
  name: ['title', 'rich_text'],
  status: ['select', 'status'],
};

export function getExpectedTypes(fieldKey, section) {
  if (section === 'report') return REPORT_FIELD_EXPECTED_TYPES[fieldKey] || [];
  if (section === 'goal') return GOAL_FIELD_EXPECTED_TYPES[fieldKey] || [];
  return TODO_FIELD_EXPECTED_TYPES[fieldKey] || [];
}

/**
 * @returns {null|'missing'|'mismatch'}
 */
export function getFieldMapIssue(val, actualType, fieldKey, section, allNames) {
  if (!val) return null;
  if (allNames.length > 0 && !allNames.includes(val)) return 'missing';
  const exp = getExpectedTypes(fieldKey, section);
  if (exp.length === 0) return null;
  if (!actualType) return null;
  if (!exp.includes(actualType)) return 'mismatch';
  return null;
}

export function getIconTypeForField(val, actualType, fieldKey, section) {
  if (actualType) return actualType;
  const exp = getExpectedTypes(fieldKey, section);
  return exp[0] || 'title';
}
