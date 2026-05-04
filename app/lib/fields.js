// app/lib/fields.js

export const DEFAULT_TODO_FIELDS = {
  name:        '이름',
  date:        '날짜',
  done:        '완료',
  /** 앱·자동매칭 기본: 한국어 템플릿의 누적(분) 열; 영어 템은 설정에서 매핑 */
  accum:       '누적(분)',
  dailyReport: '데일리 리포트',
  /** Relation → Goal Tracker DB (optional; map in Settings after adding column) */
  goal:        '',
  /** rich_text 또는 relation → 시간표(슬롯) DB (optional) */
  timeBlocking: '',
};

export const DEFAULT_REPORT_FIELDS = {
  date:     '날짜',
  review:   '하루 리뷰',
  todoList: 'To-do List',
  totalMin: '집중 합계',
};

/** Goal Tracker DB — title column name, status select name, "In progress" option label */
export const DEFAULT_GOAL_FIELDS = {
  name: 'Name',
  status: 'Status',
  inProgress: 'In progress',
};

// Safely decode a header value (handles encodeURIComponent from client)
function safeDecodeHeader(val, fallback) {
  if (!val) return fallback;
  try { return decodeURIComponent(val); } catch { return val; }
}

export function getTodoFields(headers) {
  return {
    name:        safeDecodeHeader(headers?.get?.('x-field-todo-name'),   DEFAULT_TODO_FIELDS.name),
    date:        safeDecodeHeader(headers?.get?.('x-field-todo-date'),   DEFAULT_TODO_FIELDS.date),
    done:        safeDecodeHeader(headers?.get?.('x-field-todo-done'),   DEFAULT_TODO_FIELDS.done),
    accum:       safeDecodeHeader(headers?.get?.('x-field-todo-accum'),  DEFAULT_TODO_FIELDS.accum),
    dailyReport: safeDecodeHeader(headers?.get?.('x-field-todo-report'), DEFAULT_TODO_FIELDS.dailyReport),
    goal:        safeDecodeHeader(headers?.get?.('x-field-todo-goal'), DEFAULT_TODO_FIELDS.goal),
    timeBlocking: safeDecodeHeader(headers?.get?.('x-field-todo-timeblock'), DEFAULT_TODO_FIELDS.timeBlocking),
  };
}

export function getReportFields(headers) {
  return {
    date:     safeDecodeHeader(headers?.get?.('x-field-report-date'),     DEFAULT_REPORT_FIELDS.date),
    review:   safeDecodeHeader(headers?.get?.('x-field-report-review'),   DEFAULT_REPORT_FIELDS.review),
    todoList: safeDecodeHeader(headers?.get?.('x-field-report-todolist'), DEFAULT_REPORT_FIELDS.todoList),
    totalMin: safeDecodeHeader(headers?.get?.('x-field-report-totalmin'), DEFAULT_REPORT_FIELDS.totalMin),
  };
}

function parseStatusPickerLabels(headers) {
  const raw = headers?.get?.('x-field-goal-status-picker-labels');
  if (!raw) return null;
  const dec = safeDecodeHeader(raw, '');
  if (!dec) return null;
  try {
    const a = JSON.parse(dec);
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.length > 0) : null;
  } catch {
    return null;
  }
}

export function getGoalFields(headers) {
  return {
    name: safeDecodeHeader(headers?.get?.('x-field-goal-name'), DEFAULT_GOAL_FIELDS.name),
    status: safeDecodeHeader(headers?.get?.('x-field-goal-status'), DEFAULT_GOAL_FIELDS.status),
    inProgress: safeDecodeHeader(headers?.get?.('x-field-goal-inprogress'), DEFAULT_GOAL_FIELDS.inProgress),
    statusPickerLabels: parseStatusPickerLabels(headers),
  };
}

export function buildFieldHeaders(todoFields, reportFields, goalFields) {
  const tf = { ...DEFAULT_TODO_FIELDS, ...todoFields };
  const rf = { ...DEFAULT_REPORT_FIELDS, ...reportFields };
  const gf = { ...DEFAULT_GOAL_FIELDS, ...goalFields };
  const pickerLabels = Array.isArray(gf.statusPickerLabels)
    ? gf.statusPickerLabels.filter((x) => typeof x === 'string')
    : [];
  return {
    'x-field-todo-name':        tf.name,
    'x-field-todo-date':        tf.date,
    'x-field-todo-done':        tf.done,
    'x-field-todo-accum':       tf.accum,
    'x-field-todo-report':      tf.dailyReport,
    'x-field-todo-goal':        tf.goal || '',
    'x-field-todo-timeblock':   tf.timeBlocking || '',
    'x-field-report-date':      rf.date,
    'x-field-report-review':    rf.review,
    'x-field-report-todolist':  rf.todoList,
    'x-field-report-totalmin':  rf.totalMin,
    'x-field-goal-name':        gf.name,
    'x-field-goal-status':      gf.status,
    'x-field-goal-inprogress':  gf.inProgress,
    'x-field-goal-status-picker-labels':
      pickerLabels.length > 0 ? JSON.stringify(pickerLabels) : '',
  };
}
