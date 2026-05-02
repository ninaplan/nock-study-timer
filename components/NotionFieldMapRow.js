'use client';
import NotionPropertyTypeIcon from './NotionPropertyTypeIcon';
import { getFieldMapIssue, getIconTypeForField } from '@/app/lib/notionFieldExpectations';

/**
 * @param {Map|Record<string, string>} typeMap  property name -> Notion type
 * @param {'onboarding'|'settings'} variant
 * @param {'todo'|'report'|'goal'} mapSection
 */
export default function NotionFieldMapRow({
  variant,
  lbl,
  val,
  names,
  typeMap,
  fieldKey,
  mapSection,
  loaded,
  onChange,
  onClickLoad,
  t,
  tSelectProperty,
  titleMissing,
  titleMismatch,
}) {
  const typeMapImpl = typeMap instanceof Map ? typeMap : new Map(Object.entries(typeMap || {}));
  const actual = val ? typeMapImpl.get(val) : null;
  const issue = getFieldMapIssue(val, actual, fieldKey, mapSection, names);
  const bad = issue === 'missing' || issue === 'mismatch';
  const iconType = getIconTypeForField(val, actual, fieldKey, mapSection);
  const tip =
    issue === 'missing' ? titleMissing : issue === 'mismatch' ? titleMismatch : undefined;
  const labelColor = bad ? 'var(--red)' : 'var(--text3)';
  const iconColor = bad ? 'var(--red)' : 'var(--text3)';

  if (variant === 'onboarding') {
    return (
      <div
        className="list-row"
        style={{ gap: 10, flexWrap: 'nowrap', padding: '12px 14px', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '0 1 42%', maxWidth: '48%' }}>
          <NotionPropertyTypeIcon type={iconType} size={16} color={iconColor} />
          <span
            style={{ fontSize: 18, fontWeight: 400, color: labelColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={tip}
          >
            {lbl}
            {bad ? ' ⚠' : ''}
          </span>
        </div>
        <select
          className="input notion-field-map-select"
          style={{
            flex: 1,
            minWidth: 0,
            padding: '8px 10px',
            fontSize: 18,
            fontWeight: 400,
            textAlign: 'right',
          }}
          value={val}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{tSelectProperty || t?.selectProperty}</option>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div
      className="list-row"
      style={{ gap: 10, flexWrap: 'nowrap', padding: '12px 14px', alignItems: 'center' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '0 1 40%', maxWidth: '46%' }}>
        <NotionPropertyTypeIcon type={iconType} size={16} color={iconColor} />
        <span
          style={{
            fontSize: 18,
            fontWeight: 400,
            color: bad ? 'var(--red)' : 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={tip}
        >
          {lbl}
          {bad ? ' ⚠' : ''}
        </span>
      </div>
      {loaded && names.length > 0 ? (
        <select
          className="input notion-field-map-select"
          style={{
            flex: 1,
            minWidth: 0,
            padding: '8px 10px',
            fontSize: 18,
            fontWeight: 400,
            textAlign: 'right',
          }}
          value={val}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t.selectProperty}</option>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      ) : (
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 18,
            color: 'var(--text)',
            cursor: 'pointer',
            fontWeight: 400,
            opacity: 0.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'right',
          }}
          onClick={onClickLoad}
        >
          {val || t.selectProperty}
        </span>
      )}
    </div>
  );
}
