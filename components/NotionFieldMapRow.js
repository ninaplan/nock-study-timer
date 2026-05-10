'use client';
import NotionPropertyTypeIcon from './NotionPropertyTypeIcon';
import { getFieldMapIssue, getIconTypeForField, isMapFieldRequired } from '@/app/lib/notionFieldExpectations';

function MappedPropertySelect({ value, names, onChange, ariaLabel, allowEmpty }) {
  const raw = value == null ? '' : String(value);
  const hasOrphan = raw !== '' && !names.includes(raw);
  const opts = hasOrphan ? [raw, ...names] : names;
  const selectVal = raw !== '' && opts.includes(raw) ? raw : '';
  const display = raw.trim();
  return (
    <div className="notion-field-map-select-shell settings-select-shell">
      <span
        className="settings-select-face"
        style={{
          fontSize: 'var(--list-row-label-size)',
          fontWeight: 'var(--font-weight-regular)',
          color: display ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
        }}
      >
        {display}
      </span>
      <span className="settings-chevron" aria-hidden>
        ›
      </span>
      <select
        className="settings-native-select-hidden"
        aria-label={ariaLabel}
        aria-required={allowEmpty ? undefined : true}
        required={!allowEmpty}
        value={selectVal}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowEmpty ? <option value="" /> : null}
        {opts.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

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
  titleMissing,
  titleMismatch,
  titleRequired,
}) {
  const typeMapImpl = typeMap instanceof Map ? typeMap : new Map(Object.entries(typeMap || {}));
  const actual = val ? typeMapImpl.get(val) : null;
  const issue = getFieldMapIssue(val, actual, fieldKey, mapSection, names);
  const bad = issue === 'missing' || issue === 'mismatch' || issue === 'required';
  const iconType = getIconTypeForField(val, actual, fieldKey, mapSection);
  const tip =
    issue === 'required'
      ? titleRequired
      : issue === 'missing'
        ? titleMissing
        : issue === 'mismatch'
          ? titleMismatch
          : undefined;
  const allowEmpty = !isMapFieldRequired(fieldKey, mapSection);
  const labelColor = bad ? 'var(--color-action-red)' : variant === 'onboarding' ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)';
  const iconColor = bad ? 'var(--color-action-red)' : 'var(--color-text-tertiary)';

  const labelCol = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: '0 1 48%',
        minWidth: 0,
        maxWidth: '52%',
      }}
    >
      <NotionPropertyTypeIcon type={iconType} size={16} color={iconColor} style={{ flexShrink: 0 }} />
      <span
        style={{
          fontSize: 'var(--list-row-label-size)',
          fontWeight: 'var(--list-row-label-weight)',
          color: labelColor,
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          lineHeight: 1.2,
        }}
        title={tip}
      >
        {lbl}
        {bad ? ' ⚠' : ''}
      </span>
    </div>
  );

  const unloadFace = (
    <span
      role={onClickLoad ? 'button' : undefined}
      tabIndex={onClickLoad ? 0 : undefined}
      style={{
        flex: 1,
        minWidth: 0,
        fontSize: 'var(--list-row-label-size)',
        fontWeight: 'var(--list-row-label-weight)',
        color: 'var(--color-text-tertiary)',
        cursor: onClickLoad ? 'pointer' : 'default',
        opacity: 0.65,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        textAlign: 'right',
      }}
      onClick={onClickLoad}
      onKeyDown={
        onClickLoad
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClickLoad();
            }
          : undefined
      }
    >
      {String(val || '').trim()}
    </span>
  );

  return (
    <div className="list-row notion-field-map-row" style={{ flexWrap: 'nowrap' }}>
      {labelCol}
      <div className="notion-field-map-right">
        {loaded && names.length > 0 ? (
          <MappedPropertySelect
            value={val}
            names={names}
            onChange={onChange}
            ariaLabel={lbl}
            allowEmpty={allowEmpty}
          />
        ) : (
          unloadFace
        )}
      </div>
    </div>
  );
}
