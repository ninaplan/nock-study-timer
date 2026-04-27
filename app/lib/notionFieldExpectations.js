/** Expected Notion property types per app field (integration keys). */
export const TODO_FIELD_EXPECTED_TYPES = {
  name: ['title', 'rich_text'],
  date: ['date'],
  done: ['checkbox', 'status'],
  accum: ['number', 'formula', 'rollup'],
  dailyReport: ['relation'],
};

export const REPORT_FIELD_EXPECTED_TYPES = {
  date: ['date'],
  review: ['rich_text', 'title'],
  totalMin: ['number', 'formula', 'rollup'],
  todoList: ['relation'],
};

export function getExpectedTypes(fieldKey, section) {
  const map = section === 'report' ? REPORT_FIELD_EXPECTED_TYPES : TODO_FIELD_EXPECTED_TYPES;
  return map[fieldKey] || [];
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
