// app/lib/fields.js

export const DEFAULT_TODO_FIELDS = {
  name: '이름',
  date: '날짜',
  done: '완료',
  accum: '누적(분)',
  dailyReport: '데일리 리포트',
};

export const DEFAULT_REPORT_FIELDS = {
  date: '날짜',
  review: '한줄리뷰',
  todoList: 'To-do List',
  totalMin: '오늘 순공시간(분)',
};

export function getTodoFields(headers) {
  return {
    name: headers?.get?.('x-field-todo-name') || DEFAULT_TODO_FIELDS.name,
    date: headers?.get?.('x-field-todo-date') || DEFAULT_TODO_FIELDS.date,
    done: headers?.get?.('x-field-todo-done') || DEFAULT_TODO_FIELDS.done,
    accum: headers?.get?.('x-field-todo-accum') || DEFAULT_TODO_FIELDS.accum,
    dailyReport: headers?.get?.('x-field-todo-report') || DEFAULT_TODO_FIELDS.dailyReport,
  };
}

export function getReportFields(headers) {
  return {
    date: headers?.get?.('x-field-report-date') || DEFAULT_REPORT_FIELDS.date,
    review: headers?.get?.('x-field-report-review') || DEFAULT_REPORT_FIELDS.review,
    todoList: headers?.get?.('x-field-report-todolist') || DEFAULT_REPORT_FIELDS.todoList,
    totalMin: headers?.get?.('x-field-report-totalmin') || DEFAULT_REPORT_FIELDS.totalMin,
  };
}

// Build headers object from stored settings
export function buildFieldHeaders(todoFields, reportFields) {
  const h = {};
  const tf = { ...DEFAULT_TODO_FIELDS, ...todoFields };
  const rf = { ...DEFAULT_REPORT_FIELDS, ...reportFields };
  h['x-field-todo-name'] = tf.name;
  h['x-field-todo-date'] = tf.date;
  h['x-field-todo-done'] = tf.done;
  h['x-field-todo-accum'] = tf.accum;
  h['x-field-todo-report'] = tf.dailyReport;
  h['x-field-report-date'] = rf.date;
  h['x-field-report-review'] = rf.review;
  h['x-field-report-todolist'] = rf.todoList;
  h['x-field-report-totalmin'] = rf.totalMin;
  return h;
}
