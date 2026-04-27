'use client';
import NotionPropertyTypeIcon from './NotionPropertyTypeIcon';
import { getFieldMapIssue, getIconTypeForField } from '@/app/lib/notionFieldExpectations';

/**
 * @param {Map|Record<string, string>} typeMap  property name -> Notion type
 * @param {'onboarding'|'settings'} variant
 * @param {'todo'|'report'} mapSection
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
        style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '12px 18px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <NotionPropertyTypeIcon type={iconType} size={16} color={iconColor} />
          <span
            style={{ fontSize: 13, fontWeight: 600, color: labelColor }}
            title={tip}
          >
            {lbl}
            {bad ? ' ⚠' : ''}
          </span>
        </div>
        <select
          className="input"
          style={{ padding: '8px 12px', fontSize: 14, width: '100%' }}
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
    <div className="list-row" style={{ gap: 12, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 128, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <NotionPropertyTypeIcon type={iconType} size={16} color={iconColor} />
        <span style={{ fontSize: 15, fontWeight: 500, color: bad ? 'var(--red)' : 'var(--text)' }} title={tip}>
          {lbl}
          {bad ? ' ⚠' : ''}
        </span>
      </div>
      {loaded && names.length > 0 ? (
        <select
          className="input"
          style={{ flex: 1, padding: '7px 12px', fontSize: 16, fontWeight: 300 }}
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
          style={{ flex: 1, fontSize: 16, color: 'var(--text)', cursor: 'pointer', fontWeight: 400, opacity: 0.5 }}
          onClick={onClickLoad}
        >
          {val || t.selectProperty}
        </span>
      )}
    </div>
  );
}
