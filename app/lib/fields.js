// app/lib/fields.js

export const DEFAULT_TODO_FIELDS = {
  name:        '이름',
  date:        '날짜',
  done:        '완료',
  accum:       'Focus min',
  dailyReport: '데일리 리포트',
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

export function getGoalFields(headers) {
  return {
    name: safeDecodeHeader(headers?.get?.('x-field-goal-name'), DEFAULT_GOAL_FIELDS.name),
    status: safeDecodeHeader(headers?.get?.('x-field-goal-status'), DEFAULT_GOAL_FIELDS.status),
    inProgress: safeDecodeHeader(headers?.get?.('x-field-goal-inprogress'), DEFAULT_GOAL_FIELDS.inProgress),
  };
}

export function buildFieldHeaders(todoFields, reportFields, goalFields) {
  const tf = { ...DEFAULT_TODO_FIELDS, ...todoFields };
  const rf = { ...DEFAULT_REPORT_FIELDS, ...reportFields };
  const gf = { ...DEFAULT_GOAL_FIELDS, ...goalFields };
  return {
    'x-field-todo-name':        tf.name,
    'x-field-todo-date':        tf.date,
    'x-field-todo-done':        tf.done,
    'x-field-todo-accum':       tf.accum,
    'x-field-todo-report':      tf.dailyReport,
    'x-field-report-date':      rf.date,
    'x-field-report-review':    rf.review,
    'x-field-report-todolist':  rf.todoList,
    'x-field-report-totalmin':  rf.totalMin,
    'x-field-goal-name':        gf.name,
    'x-field-goal-status':      gf.status,
    'x-field-goal-inprogress':  gf.inProgress,
  };
}
