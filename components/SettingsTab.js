'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Image from 'next/image';
import {
  ChevronLeft,
  ChevronDown,
  Mail,
  MessageSquare,
  Globe,
  CalendarDays,
  Clock,
  Sunrise,
  Megaphone,
  Shield,
  FileText,
  Database,
  ListTodo,
  BarChart2,
  Flag,
} from 'lucide-react';
import { resolveApiUrl } from './lib/apiClient';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';
import { mergeDbsById } from '@/app/lib/mergeDatabases';
import { pollDatabaseListUntilNonEmpty } from '@/app/lib/notionDbListPoll';
import { DEFAULT_TODO_FIELDS, DEFAULT_REPORT_FIELDS, DEFAULT_GOAL_FIELDS } from '@/app/lib/fields';
import { filterPropNamesByExpectedType } from '@/app/lib/notionFieldExpectations';
import { getAppVersionLabel, openSupportEmail } from '@/app/lib/supportEmail';
import { hapticLight } from './lib/haptics';
import { isLocalMode } from '@/app/lib/credsMode';
import { PREMIUM_GATES_ENABLED } from '@/app/lib/featureFlags';
import { shouldShowGoalDatabaseSection, buildGoalDatabasePickerList } from '@/app/lib/notionGoalDb';
import PopupDialog from './PopupDialog';
import SubscribeSheet, { MembershipCard } from './SubscribeSheet';
import NotionLoadingOverlay from './NotionLoadingOverlay';
import DbPicker from './DbPicker';
import NotionFieldMapRow from './NotionFieldMapRow';
import DayWindowDropdown from './DayWindowDropdown';
import GoalStatusPickerBlock from './GoalStatusPickerBlock';
import { formatDayWindowSummaryHoursOnly } from '@/app/lib/dayWindow';

const FEEDBACK_URL = 'https://nockmarket.notion.site/nock-timer-feedback';
const PRIVACY_POLICY_URL = 'https://www.nock.kr/privacy';
const TERMS_OF_SERVICE_URL = 'https://www.nock.kr/terms';

/** iOS Safari ignores text-align on select; overlay an invisible native control on a right-aligned label. */
function SettingsNativeSelect({ ariaLabel, value, options, onChange, faceStyle }) {
  const label = options.find((o) => o.value === value)?.label ?? '';
  return (
    <div className="settings-select-shell">
      <span className="settings-select-face" style={faceStyle}>
        {label}
      </span>
      <span className="settings-chevron" aria-hidden>
        ›
      </span>
      <select className="settings-native-select-hidden" aria-label={ariaLabel} value={value} onChange={onChange}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function notionFetchOpts(token) {
  return {
    credentials: 'include',
    headers: { ...(String(token || '').trim() ? { 'x-notion-token': String(token).trim() } : {}) },
  };
}

export default function SettingsTab({
  t,
  creds,
  settings,
  onSaveSettings,
  onSaveCreds,
  onDisconnect,
  locale,
  openNotionSubpageOnMount = false,
  notionOpenSignal = 0,
  inBottomSheet = false,
  onNotionDetailChange,
  onSettingsIslandCoverChange,
}) {
  const [notionDetail, setNotionDetail] = useState(!!openNotionSubpageOnMount);

  useEffect(() => {
    if (notionOpenSignal > 0) setNotionDetail(true);
  }, [notionOpenSignal]);

  useEffect(() => {
    onNotionDetailChange?.(notionDetail);
  }, [notionDetail, onNotionDetailChange]);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [token, setToken] = useState(creds?.token || '');
  const [dbTodo, setDbTodo] = useState(creds?.dbTodo || '');
  const [dbRep, setDbRep] = useState(creds?.dbReport || '');
  const [dbGoal, setDbGoal] = useState(creds?.dbGoal || '');
  const [dbs, setDbs] = useState([]);
  const [dbsRefreshKey, setDbsRefreshKey] = useState(0);
  const [tProps, setTProps] = useState([]);
  const [rProps, setRProps] = useState([]);
  const [gProps, setGProps] = useState([]);
  const [dbsListLoading, setDbsListLoading] = useState(false);
  const [dbsBlockerVisible, setDbsBlockerVisible] = useState(false);
  const [err, setErr] = useState('');
  const [loadPropsBusy, setLoadPropsBusy] = useState(false);
  const [fieldsStepVisible, setFieldsStepVisible] = useState(false);
  const [mapTodoOpen, setMapTodoOpen] = useState(false);
  const [mapReportOpen, setMapReportOpen] = useState(false);
  const [mapGoalOpen, setMapGoalOpen] = useState(false);
  /** 잠금 DB UX: 할 일/리포트/목표 행 클릭 시 서브페이지 대신 아래로 속성 매핑 펼침 */
  const [lockedMapExpand, setLockedMapExpand] = useState(null); // null | 'todo' | 'report' | 'goal'
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [subscribeSheetOpen, setSubscribeSheetOpen] = useState(false);
  const [dayWindowOpen, setDayWindowOpen] = useState(false);
  useEffect(() => {
    onSettingsIslandCoverChange?.(dayWindowOpen);
    return () => onSettingsIslandCoverChange?.(false);
  }, [dayWindowOpen, onSettingsIslandCoverChange]);
  const dbsBlockerTimer = useRef(null);
  const prevDbsLenForErrClear = useRef(null);
  const credsRef = useRef(creds);
  const tokenFieldRef = useRef(token);
  const sessionBumpRef = useRef(false);
  credsRef.current = creds;
  tokenFieldRef.current = token;
  const ko = locale === 'ko';
  const reportReviewLabel = ko ? '하루 리뷰' : 'Daily Review';
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionAuthenticated, setSessionAuthenticated] = useState(false);
  /** Goal DB 상태 속성의 노션 옵션 목록 (진행 중 드롭다운) */
  const [goalStatusOptions, setGoalStatusOptions] = useState([]);
  const [goalStatusOptionsLoading, setGoalStatusOptionsLoading] = useState(false);

  useEffect(() => {
    if (isLocalMode(creds)) return;
    fetch(resolveApiUrl('/api/subscription'), { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setSubscription(d))
      .catch(() => {});
  }, [creds?.authMode]);
  const reportTotalLabel = ko ? '집중 합계' : 'Focus Total';

  const hasPremium =
    !PREMIUM_GATES_ENABLED ||
    isLocalMode(creds) ||
    subscription?.status === 'active' ||
    subscription?.status === 'trialing';

  const showGoalDatabaseSection = useMemo(
    () => shouldShowGoalDatabaseSection(dbs, String(dbGoal || creds?.dbGoal || '').trim()),
    [dbs, dbGoal, creds?.dbGoal]
  );
  const goalDbPickerDatabases = useMemo(
    () => buildGoalDatabasePickerList(dbs, dbGoal),
    [dbs, dbGoal]
  );
  const hasLockedDbs = Boolean(String(creds?.dbTodo || '').trim());
  const lockedTodoDbName = useMemo(
    () => dbs.find((d) => d.id === String(creds?.dbTodo || '').trim())?.title || '',
    [dbs, creds?.dbTodo]
  );
  const lockedReportDbName = useMemo(
    () => dbs.find((d) => d.id === String(creds?.dbReport || '').trim())?.title || '',
    [dbs, creds?.dbReport]
  );
  const lockedGoalDbName = useMemo(
    () => dbs.find((d) => d.id === String(creds?.dbGoal || '').trim())?.title || '',
    [dbs, creds?.dbGoal]
  );

  const todoMapFieldDefs = useMemo(() => {
    const base = [
      { key: 'name', lbl: t.fieldName },
      { key: 'date', lbl: t.fieldDate },
      { key: 'done', lbl: t.fieldDone },
      { key: 'accum', lbl: t.fieldAccum },
    ];
    if (!hasPremium) return base;
    return [
      ...base,
      { key: 'goal', lbl: t.fieldGoalRelation },
      { key: 'timeBlocking', lbl: t.fieldTimeBlocking },
    ];
  }, [hasPremium, t]);

  /** OAuth 직후 httpOnly 쿠키 지연 시 authenticated 가 잠깐 false → 재시도. 첫 세션 응답 후 바로 sessionReady 로 DB 목록도 병행 시작 */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let openedGate = false;
      const openGate = () => {
        if (openedGate || cancelled) return;
        openedGate = true;
        setSessionReady(true);
      };
      try {
        for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 280));
          try {
            const r = await fetch(resolveApiUrl('/api/auth/session'), { credentials: 'include' });
            const j = await r.json().catch(() => ({}));
            if (cancelled) return;
            setSessionAuthenticated(!!j?.authenticated);
            openGate();
            if (j?.authenticated) break;
          } catch {
            if (!cancelled) setSessionAuthenticated(false);
            openGate();
          }
        }
      } finally {
        openGate();
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const tf = { ...DEFAULT_TODO_FIELDS, ...(settings?.todoFields || {}) };
  const rf = { ...DEFAULT_REPORT_FIELDS, ...(settings?.reportFields || {}) };
  const gf = { ...DEFAULT_GOAL_FIELDS, ...(settings?.goalFields || {}) };

  const hasMappedTodoField = Boolean(String(tf?.name || '').trim());
  const dbsSelectionSynced =
    String(dbTodo ?? '') === String(creds?.dbTodo ?? '') &&
    String(dbRep ?? '') === String(creds?.dbReport ?? '') &&
    String(dbGoal ?? '').trim() === String(creds?.dbGoal ?? '').trim();
  const showPropertyMapping = fieldsStepVisible || (hasMappedTodoField && dbsSelectionSynced);

  const startNotionOAuth = useCallback(async () => {
    setErr('');
    setOauthBusy(true);
    try {
      const res = await fetch(resolveApiUrl('/api/auth/notion?format=json&return=settings'), {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`);
      if (data?.url) window.location.href = data.url;
      else throw new Error('No authorize URL');
    } catch (e) {
      setErr(e?.message || 'OAuth failed');
    } finally {
      setOauthBusy(false);
    }
  }, []);

  const readJsonSafe = async (res) => {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await res.text();
      throw new Error(txt.includes('<!DOCTYPE') ? '서버 라우트 오류(HTML 응답)' : txt || '서버 응답 오류');
    }
    return res.json();
  };

  const fetchPropsImpl = async (id, type) => {
    if (!id) return;
    const res = await fetch(
      resolveApiUrl(`/api/databases/properties?dbId=${encodeURIComponent(id)}`),
      notionFetchOpts(token || creds?.token)
    );
    const d = await readJsonSafe(res);
    if (!res.ok) throw new Error(d?.error || 'Failed');
    if (type === 'todo') setTProps(d.properties || []);
    else if (type === 'report') setRProps(d.properties || []);
    else if (type === 'goal') setGProps(d.properties || []);
  };

  const fetchProps = async (id, type) => {
    try {
      await fetchPropsImpl(id, type);
    } catch (e) {
      setErr(e?.message || 'Failed');
    }
  };

  const persistNotionDbSelection = useCallback(
    async (patch = {}) => {
      const nextTodo = patch.dbTodo !== undefined ? patch.dbTodo : dbTodo;
      const nextRep = patch.dbReport !== undefined ? patch.dbReport : dbRep;
      const nextGoal = patch.dbGoal !== undefined ? patch.dbGoal : dbGoal;

      if (!String(nextTodo || '').trim()) {
        setErr(ko ? '할 일 데이터베이스를 선택해 주세요.' : 'Select a to-do database.');
        return;
      }
      const tok = (tokenFieldRef.current || '').trim();
      if (!tok && !creds?.authMode && !creds?.token) {
        setErr(ko ? '토큰이 필요해요.' : 'Token is required.');
        return;
      }
      setErr('');
      setLoadPropsBusy(true);
      try {
        const next = {
          ...creds,
          dbTodo: String(nextTodo).trim(),
          dbReport: nextRep ? String(nextRep).trim() : '',
        };
        if (String(nextGoal || '').trim()) next.dbGoal = String(nextGoal).trim();
        else delete next.dbGoal;
        if (tok) next.token = tok;
        else if (creds?.token) next.token = creds.token;
        onSaveCreds(next);
        await fetchPropsImpl(String(nextTodo).trim(), 'todo');
        if (next.dbReport) await fetchPropsImpl(next.dbReport, 'report');
        const gid = String(nextGoal || '').trim();
        if (gid) await fetchPropsImpl(gid, 'goal');
        setFieldsStepVisible(true);
      } catch (e) {
        setErr(e?.message || 'Failed');
      } finally {
        setLoadPropsBusy(false);
      }
    },
    [creds, dbTodo, dbRep, dbGoal, ko, onSaveCreds]
  );

  const chgField = (type, key, val) => {
    if (type === 'todo') onSaveSettings({ ...settings, todoFields: { ...tf, [key]: val } });
    else onSaveSettings({ ...settings, reportFields: { ...rf, [key]: val } });
  };

  const chgGoalField = (key, val) => {
    onSaveSettings({ ...settings, goalFields: { ...gf, [key]: val } });
  };

  useEffect(() => {
    let cancelled = false;
    if (!notionDetail || isLocalMode(creds)) {
      setGoalStatusOptions([]);
      setGoalStatusOptionsLoading(false);
      return undefined;
    }
    const id = String(dbGoal || '').trim();
    const prop = String(gf.status || '').trim();
    const tok = (tokenFieldRef.current || token || credsRef.current?.token || '').trim();
    const oauthOk = creds?.authMode === 'oauth' && hasNotionAuth(creds);
    if (!hasNotionAuth(creds) || !id || !prop) {
      setGoalStatusOptions([]);
      setGoalStatusOptionsLoading(false);
      return undefined;
    }
    if (!oauthOk && !tok) {
      setGoalStatusOptions([]);
      setGoalStatusOptionsLoading(false);
      return undefined;
    }
    setGoalStatusOptionsLoading(true);
    (async () => {
      try {
        const res = await fetch(
          resolveApiUrl(
            `/api/databases/status-options?dbId=${encodeURIComponent(id)}&property=${encodeURIComponent(prop)}`
          ),
          notionFetchOpts(tok)
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setGoalStatusOptions(Array.isArray(data?.options) ? data.options : []);
      } catch {
        if (!cancelled) setGoalStatusOptions([]);
      } finally {
        if (!cancelled) setGoalStatusOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notionDetail, creds?.authMode, dbGoal, gf.status, token, creds?.token, settings?.goalFields?.status]);

  useEffect(() => {
    if (!showPropertyMapping) return;
    if (hasNotionAuth(creds) && creds?.dbTodo && tProps.length === 0) fetchProps(creds.dbTodo, 'todo');
    if (hasNotionAuth(creds) && creds?.dbReport && rProps.length === 0) fetchProps(creds.dbReport, 'report');
    if (hasNotionAuth(creds) && creds?.dbGoal && gProps.length === 0) fetchProps(creds.dbGoal, 'goal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPropertyMapping, creds?.authMode, creds?.token, creds?.dbTodo, creds?.dbReport, creds?.dbGoal]);

  const canLoadDbs = hasNotionAuth(creds) || token.trim();
  const isOAuth = creds?.authMode === 'oauth' && hasNotionAuth(creds);

  /** 노션 하위: 토큰 입력 또는 DB 목록 비었을 때만 카드 표시 (OAuth+목록 있음 시 빈 카드 숨김) */
  const showNotionDbSetupCard =
    hasNotionAuth(creds) &&
    (!(creds?.authMode === 'oauth' && hasNotionAuth(creds)) ||
      (!dbsListLoading && dbs.length === 0 && canLoadDbs));

  useEffect(() => {
    if (!notionDetail) sessionBumpRef.current = false;
  }, [notionDetail]);

  useEffect(() => {
    if (!notionDetail) setLockedMapExpand(null);
  }, [notionDetail]);

  useEffect(() => {
    if (!notionDetail || !hasNotionAuth(creds) || !hasLockedDbs || !lockedMapExpand) return;
    if (lockedMapExpand === 'todo' && creds.dbTodo) void fetchProps(creds.dbTodo, 'todo');
    if (lockedMapExpand === 'report' && creds.dbReport) void fetchProps(creds.dbReport, 'report');
    const gid = String(creds.dbGoal || '').trim();
    if (lockedMapExpand === 'goal' && gid) void fetchProps(gid, 'goal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notionDetail, hasLockedDbs, lockedMapExpand, creds?.dbTodo, creds?.dbReport, creds?.dbGoal, creds?.authMode]);

  useEffect(() => {
    if (!notionDetail || !canLoadDbs || !sessionReady) return;
    const tok = (tokenFieldRef.current || '').trim();
    if (tok) return;
    if (!isOAuth || sessionAuthenticated) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      (async () => {
        try {
          const r = await fetch(resolveApiUrl('/api/auth/session'), { credentials: 'include' });
          const j = await r.json().catch(() => ({}));
          if (cancelled) return;
          if (j?.authenticated) {
            setSessionAuthenticated(true);
            if (!sessionBumpRef.current) {
              sessionBumpRef.current = true;
              setDbsRefreshKey((k) => k + 1);
            }
          }
        } catch { /* */ }
      })();
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [notionDetail, canLoadDbs, sessionReady, isOAuth, sessionAuthenticated]);

  useEffect(() => {
    if (!notionDetail) {
      setDbs([]);
      setDbsListLoading(false);
      setDbsBlockerVisible(false);
    }
  }, [notionDetail]);

  useEffect(() => {
    if (dbsBlockerTimer.current) {
      clearTimeout(dbsBlockerTimer.current);
      dbsBlockerTimer.current = null;
    }
    if (dbsListLoading && dbs.length === 0) {
      dbsBlockerTimer.current = setTimeout(() => setDbsBlockerVisible(true), 450);
    } else {
      setDbsBlockerVisible(false);
    }
    return () => {
      if (dbsBlockerTimer.current) {
        clearTimeout(dbsBlockerTimer.current);
        dbsBlockerTimer.current = null;
      }
    };
  }, [dbsListLoading, dbs.length]);

  // 노션 화면에서만: DB 목록 — 1차 응답 직후 짧은 뒤 보강 fetch로 id 합집합(한쪽 검색 지연/오류로 목록이 잘리는 경우 완화)
  useEffect(() => {
    if (!notionDetail || !canLoadDbs) return;
    const tokEarly = (tokenFieldRef.current || credsRef.current?.token || '').trim();
    /* 세션 플래그가 한 번 false였다고 DB fetch 를 영구 차단하지 않음 — /api/databases 는 쿠키만 있으면 되고, 401 시 fetch 안에서 재시도함 */
    if (isOAuth && !tokEarly && !sessionReady) return;
    let cancelled = false;
    const ac = new AbortController();
    let supplementTimer;
    let supplementAc;
    setDbsListLoading(true);
    setErr('');
    (async () => {
      try {
        const fetchDbsOnce = async () => {
          const tok = (tokenFieldRef.current || credsRef.current?.token || '').trim();
          let res = await fetch(resolveApiUrl('/api/databases'), {
            ...notionFetchOpts(tok),
            signal: ac.signal,
          });
          let data = await res.json().catch(() => ({}));
          if (
            res.status === 401 &&
            String(data?.error || '').includes('Missing token') &&
            isOAuth &&
            !(tokenFieldRef.current || credsRef.current?.token || '').trim()
          ) {
            await new Promise((r) => setTimeout(r, 300));
            if (cancelled) {
              const e = new Error('Aborted');
              e.name = 'AbortError';
              throw e;
            }
            res = await fetch(resolveApiUrl('/api/databases'), {
              ...notionFetchOpts(tok),
              signal: ac.signal,
            });
            data = await res.json().catch(() => ({}));
          }
          return { res, data };
        };

        const polled = await pollDatabaseListUntilNonEmpty({
          fetchOnce: fetchDbsOnce,
          signal: ac.signal,
          maxAttempts: 12,
          delayMs: 720,
        });
        if (cancelled) return;
        setDbs(polled.databases || []);
        if (polled.gaveUpEmpty) {
          setErr(`${t.dbsLoadTimeout}\n\n${t.dbsLoadTimeoutHint}`);
        }
        supplementTimer = setTimeout(() => {
          if (cancelled) return;
          supplementAc = new AbortController();
          (async () => {
            try {
              const res2 = await fetch(resolveApiUrl('/api/databases'), {
                ...notionFetchOpts((tokenFieldRef.current || credsRef.current?.token || '').trim()),
                signal: supplementAc.signal,
              });
              const d2 = await res2.json();
              if (cancelled || !res2.ok) return;
              setDbs((p) => mergeDbsById(p, d2.databases || []));
            } catch (e) {
              if (e?.name === 'AbortError') return;
            }
          })();
        }, 480);
      } catch (e) {
        if (cancelled || e?.name === 'AbortError') return;
        setErr(e?.message || 'Failed');
      } finally {
        if (!cancelled) setDbsListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (supplementTimer) clearTimeout(supplementTimer);
      supplementAc?.abort();
      ac.abort();
      setDbsListLoading(false);
      setDbsBlockerVisible(false);
    };
  }, [notionDetail, canLoadDbs, dbsRefreshKey, isOAuth, sessionReady, sessionAuthenticated]);

  useEffect(() => {
    if (!notionDetail || !canLoadDbs) return;
    const prev = prevDbsLenForErrClear.current;
    if (prev !== null && prev === 0 && dbs.length > 0) setErr('');
    prevDbsLenForErrClear.current = dbs.length;
  }, [notionDetail, canLoadDbs, dbs.length]);

  useEffect(() => {
    setToken(creds?.token || '');
    setDbTodo(creds?.dbTodo || '');
    setDbRep(creds?.dbReport || '');
    setDbGoal(creds?.dbGoal || '');
  }, [creds]);

  useEffect(() => {
    if (canLoadDbs) return;
    setDbsListLoading(false);
    setDbsBlockerVisible(false);
  }, [canLoadDbs]);

  const dbsLenRef = useRef(0);
  dbsLenRef.current = dbs.length;
  const visBumpAt = useRef(0);
  useEffect(() => {
    if (!notionDetail || !canLoadDbs) return;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      const throttleMs = dbsLenRef.current === 0 ? 800 : 3200;
      if (now - visBumpAt.current < throttleMs) return;
      visBumpAt.current = now;
      if (dbsLenRef.current === 0) {
        setDbsRefreshKey((k) => k + 1);
        return;
      }
      (async () => {
        try {
          const tok = (tokenFieldRef.current || credsRef.current?.token || '').trim();
          const res = await fetch(resolveApiUrl('/api/databases'), {
            ...notionFetchOpts(tok),
          });
          const d = await res.json();
          if (!res.ok) return;
          setDbs((p) => mergeDbsById(p, d.databases || []));
        } catch { /* */ }
      })();
    };
    const onPageShow = (e) => {
      if (e.persisted) setDbsRefreshKey((k) => k + 1);
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [notionDetail, canLoadDbs]);

  const isStatusPickerChecked = (label) => {
    if (Array.isArray(gf.statusPickerLabels)) return gf.statusPickerLabels.includes(label);
    const ip = String(gf.inProgress || 'In progress').trim();
    return goalStatusOptions.includes(ip) && label === ip;
  };

  const toggleStatusPickerLabel = (label) => {
    hapticLight();
    let base;
    if (Array.isArray(gf.statusPickerLabels)) {
      base = [...gf.statusPickerLabels];
    } else {
      const ip = String(gf.inProgress || 'In progress').trim();
      base = ip && goalStatusOptions.includes(ip) ? [ip] : [];
    }
    const set = new Set(base);
    if (set.has(label)) set.delete(label);
    else set.add(label);
    chgGoalField('statusPickerLabels', [...set]);
  };

  if (notionDetail) {
    return (
      <div className="settings-page" style={{ minHeight: '100%' }}>
        <div
          className="page-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '20px 16px 22px',
          }}
        >
          <button
            type="button"
            aria-label={t.back}
            onClick={() => setNotionDetail(false)}
            style={{
              background: 'none',
              border: 'none',
              padding: 4,
              marginLeft: -4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ChevronLeft size={28} strokeWidth={2.1} color="var(--text)" />
          </button>
          <div className="page-title" style={{ margin: 0, flex: 1, letterSpacing: '-0.3px' }}>
            {t.notionSubpageTitle}
          </div>
        </div>

        <div style={{ padding: '0 16px 48px' }}>
          {!hasNotionAuth(creds) ? (
            <div className="stack" style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 8 }}>{t.connectToSave}</p>
              <button
                type="button"
                className="btn btn-dark btn-md btn-full"
                style={{ borderRadius: 12 }}
                onClick={startNotionOAuth}
                disabled={oauthBusy}
              >
                {oauthBusy ? <span className="spin spin-dark" /> : t.signInWithNotion}
              </button>
            </div>
          ) : (
            <>
              {isOAuth && (
                <button
                  type="button"
                  onClick={() => {
                    hapticLight();
                    startNotionOAuth();
                  }}
                  disabled={oauthBusy}
                  className="card card--outline card--row-pad w-full flex items-center justify-between gap-list-row mb-stack-md"
                  style={{
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'var(--font)',
                    color: 'var(--text)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                    <span
                      className="settings-notion-trail-dot"
                      style={{ paddingTop: 2 }}
                      aria-hidden
                    >
                      ●
                    </span>
                    <span
                      className="truncate"
                      style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)' }}
                    >
                      {creds.workspaceName || (ko ? '워크스페이스' : 'Workspace')}
                    </span>
                  </div>
                  {oauthBusy ? (
                    <span className="spin spin-dark" style={{ width: 18, height: 18, flexShrink: 0 }} />
                  ) : (
                    <span className="settings-chevron" style={{ color: 'var(--text3)' }} aria-hidden>
                      ›
                    </span>
                  )}
                </button>
              )}

              {!isOAuth && (
                <div className="card card-p" style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, marginBottom: 6 }}>{t.tokenLabel}</div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: 'var(--text)',
                      letterSpacing: '-0.3px',
                      wordBreak: 'break-all',
                      lineHeight: 1.3,
                    }}
                  >
                    {creds.token ? `${creds.token.slice(0, 12)}…` : t.connected}
                  </div>
                </div>
              )}
            </>
          )}

          {hasNotionAuth(creds) && (
            <>
              {err && (
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--red)',
                    fontWeight: 600,
                    marginBottom: 12,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-line',
                  }}
                >
                  {err}
                </div>
              )}
              <div className="sec-label">{t.selectDatabases}</div>
              {showNotionDbSetupCard && (
                <div className="card card-p card-p--notion-db mb-stack-md">
                  <div className="stack">
                    {!(creds?.authMode === 'oauth' && hasNotionAuth(creds)) && (
                      <div>
                        <label className="label">{t.tokenLabel}</label>
                        <input
                          className="input"
                          type="password"
                          placeholder={t.tokenPlaceholder}
                          value={token}
                          onChange={(e) => setToken(e.target.value)}
                        />
                      </div>
                    )}
                    {!dbsListLoading && dbs.length === 0 && canLoadDbs && (
                      <div className="stack" style={{ gap: 12 }}>
                        <button
                          type="button"
                          onClick={() => {
                            hapticLight();
                            setErr('');
                            setDbsRefreshKey((k) => k + 1);
                          }}
                          className="btn btn-md"
                          style={{
                            alignSelf: 'flex-start',
                            borderRadius: 10,
                            padding: '9px 16px',
                            fontSize: 14,
                            fontWeight: 600,
                            background: 'var(--bg2)',
                            border: '1px solid var(--sep)',
                            color: 'var(--text)',
                          }}
                        >
                          {t.reloadDatabases}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(dbs.length > 0 || hasLockedDbs) && (
                <>
                  {hasLockedDbs ? (
                  <>
                    <div className="list-sec list-sec--stack-md">
                      <button
                        type="button"
                        className="list-row w-full"
                        aria-expanded={lockedMapExpand === 'todo'}
                        onClick={() => {
                          hapticLight();
                          setLockedMapExpand((s) => (s === 'todo' ? null : 'todo'));
                        }}
                        style={{
                          border: 'none',
                          borderBottom: lockedMapExpand === 'todo' ? 'none' : '0.5px solid var(--sep)',
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flexShrink: 0,
                            minWidth: 0,
                            maxWidth: '42%',
                          }}
                        >
                          <div className="settings-row-icon">
                            <ListTodo size={18} strokeWidth={2} color="var(--text2)" aria-hidden />
                          </div>
                          <span
                            className="truncate"
                            style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)', textAlign: 'left' }}
                          >
                            {t.notionDbLabelTodo}
                          </span>
                        </div>
                        <span
                          className="truncate"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 18,
                            fontWeight: 400,
                            color: 'var(--text3)',
                            textAlign: 'right',
                          }}
                        >
                          {lockedTodoDbName || '\u2014'}
                        </span>
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            flexShrink: 0,
                            color: 'var(--text3)',
                            transform: lockedMapExpand === 'todo' ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.2s ease',
                          }}
                          aria-hidden
                        >
                          <ChevronDown size={20} strokeWidth={2} />
                        </span>
                      </button>
                      {lockedMapExpand === 'todo' && (
                        <div className="locked-db-map-expand">
                          <PropRows
                            embedInCard
                            fields={todoMapFieldDefs}
                            values={tf}
                            props={tProps}
                            mapSection="todo"
                            onLoad={() => fetchProps(creds.dbTodo, 'todo')}
                            onChange={(k, v) => chgField('todo', k, v)}
                            t={t}
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        className="list-row w-full"
                        aria-expanded={lockedMapExpand === 'report'}
                        onClick={() => {
                          hapticLight();
                          setLockedMapExpand((s) => (s === 'report' ? null : 'report'));
                        }}
                        style={{
                          border: 'none',
                          borderTop: '0.5px solid var(--sep)',
                          borderBottom: lockedMapExpand === 'report'
                            ? 'none'
                            : (showGoalDatabaseSection ? '0.5px solid var(--sep)' : 'none'),
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flexShrink: 0,
                            minWidth: 0,
                            maxWidth: '42%',
                          }}
                        >
                          <div className="settings-row-icon">
                            <BarChart2 size={18} strokeWidth={2} color="var(--text2)" aria-hidden />
                          </div>
                          <span
                            className="truncate"
                            style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)', textAlign: 'left' }}
                          >
                            {t.notionDbLabelReport}
                          </span>
                        </div>
                        <span
                          className="truncate"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 18,
                            fontWeight: 400,
                            color: 'var(--text3)',
                            textAlign: 'right',
                          }}
                        >
                          {lockedReportDbName || '\u2014'}
                        </span>
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            flexShrink: 0,
                            color: 'var(--text3)',
                            transform: lockedMapExpand === 'report' ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.2s ease',
                          }}
                          aria-hidden
                        >
                          <ChevronDown size={20} strokeWidth={2} />
                        </span>
                      </button>
                      {lockedMapExpand === 'report' && (
                        <div className="locked-db-map-expand">
                          {!dbRep ? (
                            <div className="card card-p card-p--notion-db" style={{ margin: 0 }}>
                              <DbPicker
                                LeadingIcon={BarChart2}
                                label={t.notionDbLabelReport}
                                value={dbRep}
                                databases={dbs}
                                onChange={(id) => {
                                  hapticLight();
                                  setDbRep(id);
                                  setRProps([]);
                                  void persistNotionDbSelection({ dbReport: id });
                                }}
                                placeholder={t.selectDB}
                                compact
                                expandBelow
                                busy={loadPropsBusy}
                                nameFontSize={18}
                                labelFontSize={18}
                              />
                              <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.45, margin: '10px 0 0' }}>
                                {t.notionHintReportDb}
                              </p>
                            </div>
                          ) : (
                            <PropRows
                              embedInCard
                              fields={[
                                { key: 'review', lbl: reportReviewLabel },
                                { key: 'totalMin', lbl: reportTotalLabel },
                              ]}
                              values={rf}
                              props={rProps}
                              mapSection="report"
                              onLoad={() => fetchProps(creds.dbReport, 'report')}
                              onChange={(k, v) => chgField('report', k, v)}
                              t={t}
                            />
                          )}
                        </div>
                      )}
                      {showGoalDatabaseSection ? (
                        <>
                          <button
                            type="button"
                            className="list-row w-full"
                            aria-expanded={lockedMapExpand === 'goal'}
                            onClick={() => {
                              hapticLight();
                              setLockedMapExpand((s) => (s === 'goal' ? null : 'goal'));
                            }}
                            style={{
                              border: 'none',
                              borderTop: '0.5px solid var(--sep)',
                              borderBottom: lockedMapExpand === 'goal' ? 'none' : undefined,
                              cursor: 'pointer',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                flexShrink: 0,
                                minWidth: 0,
                                maxWidth: '42%',
                              }}
                            >
                              <div className="settings-row-icon">
                                <Flag size={18} strokeWidth={2} color="var(--text2)" aria-hidden />
                              </div>
                              <span
                                className="truncate"
                                style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)', textAlign: 'left' }}
                              >
                                {t.notionDbLabelGoal}
                              </span>
                            </div>
                            <span
                              className="truncate"
                              style={{
                                flex: 1,
                                minWidth: 0,
                                fontSize: 18,
                                fontWeight: 400,
                                color: 'var(--text3)',
                                textAlign: 'right',
                              }}
                            >
                              {lockedGoalDbName || '\u2014'}
                            </span>
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                flexShrink: 0,
                                color: 'var(--text3)',
                                transform: lockedMapExpand === 'goal' ? 'rotate(180deg)' : 'none',
                                transition: 'transform 0.2s ease',
                              }}
                              aria-hidden
                            >
                              <ChevronDown size={20} strokeWidth={2} />
                            </span>
                          </button>
                          {lockedMapExpand === 'goal' && (
                            <div className="locked-db-map-expand">
                              {!String(dbGoal || '').trim() ? (
                                <div className="card card-p card-p--notion-db" style={{ margin: 0 }}>
                                  <DbPicker
                                    LeadingIcon={Flag}
                                    label={t.notionDbLabelGoal}
                                    value={dbGoal}
                                    databases={goalDbPickerDatabases}
                                    onChange={(id) => {
                                      hapticLight();
                                      setDbGoal(id);
                                      setGProps([]);
                                      void persistNotionDbSelection({ dbGoal: id });
                                    }}
                                    placeholder={t.selectDBOptional}
                                    compact
                                    expandBelow
                                    busy={loadPropsBusy}
                                    nameFontSize={18}
                                    labelFontSize={18}
                                  />
                                  <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.45, margin: '10px 0 0' }}>
                                    {t.notionHintGoalDb}
                                  </p>
                                </div>
                              ) : (
                                <PropRows
                                  embedInCard
                                  fields={[
                                    { key: 'name', lbl: t.goalMapName },
                                    { key: 'status', lbl: t.goalMapStatus },
                                  ]}
                                  values={gf}
                                  props={gProps}
                                  mapSection="goal"
                                  onLoad={() => fetchProps(String(dbGoal).trim(), 'goal')}
                                  onChange={(k, v) => chgGoalField(k, v)}
                                  t={t}
                                  extraFooter={
                                    <GoalStatusPickerBlock
                                      t={t}
                                      loading={goalStatusOptionsLoading}
                                      options={goalStatusOptions}
                                      isChecked={isStatusPickerChecked}
                                      onToggle={toggleStatusPickerLabel}
                                    />
                                  }
                                />
                              )}
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>
                  </>
                  ) : (
                  <>
                  <div className="list-sec list-sec--stack-md">
                    <div className="sec-label sec-label--in-list">
                      {t.notionMapTodoFields}
                    </div>
                    <DbPicker
                      LeadingIcon={ListTodo}
                      label={t.notionDbLabelTodo}
                      value={dbTodo}
                      databases={dbs}
                      onChange={(id) => {
                        hapticLight();
                        setDbTodo(id);
                        setTProps([]);
                        void persistNotionDbSelection({ dbTodo: id });
                      }}
                      placeholder={t.selectDB}
                      compact
                      expandBelow
                      busy={loadPropsBusy}
                      nameFontSize={18}
                      labelFontSize={18}
                    />
                    <p
                      style={{
                        fontSize: 13,
                        color: 'var(--text3)',
                        lineHeight: 1.45,
                        margin: 0,
                        padding: '4px 14px 10px',
                      }}
                    >
                      {t.notionHintTodoDb}
                    </p>
                    <button
                      type="button"
                      className="list-row w-full"
                      onClick={() => {
                        hapticLight();
                        setMapTodoOpen((o) => !o);
                      }}
                      style={{
                        border: 'none',
                        borderTop: '0.5px solid var(--sep)',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        className="settings-row-icon"
                        style={{
                          transform: mapTodoOpen ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.2s ease',
                        }}
                      >
                        <ChevronDown
                          size={20}
                          strokeWidth={2}
                          color="var(--text3)"
                        />
                      </div>
                      <span style={{ flex: 1, textAlign: 'left', fontSize: 18, fontWeight: 500, color: 'var(--text)' }}>
                        {mapTodoOpen ? t.notionHidePropertyMapping : t.notionShowPropertyMapping}
                      </span>
                    </button>
                    {showPropertyMapping && dbTodo && mapTodoOpen && (
                      <PropRows
                        embedInCard
                        fields={todoMapFieldDefs}
                        values={tf}
                        props={tProps}
                        mapSection="todo"
                        onLoad={() => fetchProps(creds.dbTodo, 'todo')}
                        onChange={(k, v) => chgField('todo', k, v)}
                        t={t}
                      />
                    )}
                  </div>

                  <div className="list-sec list-sec--stack-md">
                    <div className="sec-label sec-label--in-list">
                      {t.notionMapReportFields}
                    </div>
                    <DbPicker
                      LeadingIcon={BarChart2}
                      label={t.notionDbLabelReport}
                      value={dbRep}
                      databases={dbs}
                      onChange={(id) => {
                        hapticLight();
                        setDbRep(id);
                        setRProps([]);
                        void persistNotionDbSelection({ dbReport: id });
                      }}
                      placeholder={t.selectDB}
                      compact
                      expandBelow
                      busy={loadPropsBusy}
                      nameFontSize={18}
                      labelFontSize={18}
                    />
                    <p
                      style={{
                        fontSize: 13,
                        color: 'var(--text3)',
                        lineHeight: 1.45,
                        margin: 0,
                        padding: '4px 14px 10px',
                      }}
                    >
                      {t.notionHintReportDb}
                    </p>
                    <button
                      type="button"
                      className="list-row w-full"
                      onClick={() => {
                        hapticLight();
                        setMapReportOpen((o) => !o);
                      }}
                      style={{
                        border: 'none',
                        borderTop: '0.5px solid var(--sep)',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        className="settings-row-icon"
                        style={{
                          transform: mapReportOpen ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.2s ease',
                        }}
                      >
                        <ChevronDown
                          size={20}
                          strokeWidth={2}
                          color="var(--text3)"
                        />
                      </div>
                      <span style={{ flex: 1, textAlign: 'left', fontSize: 18, fontWeight: 500, color: 'var(--text)' }}>
                        {mapReportOpen ? t.notionHidePropertyMapping : t.notionShowPropertyMapping}
                      </span>
                    </button>
                    {showPropertyMapping && dbRep && mapReportOpen && (
                      <PropRows
                        embedInCard
                        fields={[
                          { key: 'review', lbl: reportReviewLabel },
                          { key: 'totalMin', lbl: reportTotalLabel },
                        ]}
                        values={rf}
                        props={rProps}
                        mapSection="report"
                        onLoad={() => fetchProps(creds.dbReport, 'report')}
                        onChange={(k, v) => chgField('report', k, v)}
                        t={t}
                      />
                    )}
                  </div>

                  {showGoalDatabaseSection && (
                  <div className="list-sec list-sec--stack-md">
                    <div className="sec-label sec-label--in-list">
                      {t.notionMapGoalFields}
                    </div>
                    <DbPicker
                      LeadingIcon={Flag}
                      label={t.notionDbLabelGoal}
                      value={dbGoal}
                      databases={goalDbPickerDatabases}
                      onChange={(id) => {
                        hapticLight();
                        setDbGoal(id);
                        setGProps([]);
                        void persistNotionDbSelection({ dbGoal: id });
                      }}
                      placeholder={t.selectDBOptional}
                      compact
                      expandBelow
                      busy={loadPropsBusy}
                      nameFontSize={18}
                      labelFontSize={18}
                    />
                    <p
                      style={{
                        fontSize: 13,
                        color: 'var(--text3)',
                        lineHeight: 1.45,
                        margin: 0,
                        padding: '4px 14px 10px',
                      }}
                    >
                      {t.notionHintGoalDb}
                    </p>
                    <button
                      type="button"
                      className="list-row w-full"
                      onClick={() => {
                        hapticLight();
                        setMapGoalOpen((o) => !o);
                      }}
                      style={{
                        border: 'none',
                        borderTop: '0.5px solid var(--sep)',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        className="settings-row-icon"
                        style={{
                          transform: mapGoalOpen ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.2s ease',
                        }}
                      >
                        <ChevronDown
                          size={20}
                          strokeWidth={2}
                          color="var(--text3)"
                        />
                      </div>
                      <span style={{ flex: 1, textAlign: 'left', fontSize: 18, fontWeight: 500, color: 'var(--text)' }}>
                        {mapGoalOpen ? t.notionHidePropertyMapping : t.notionShowPropertyMapping}
                      </span>
                    </button>
                    {showPropertyMapping && String(dbGoal || '').trim() && mapGoalOpen && (
                      <PropRows
                        embedInCard
                        fields={[
                          { key: 'name', lbl: t.goalMapName },
                          { key: 'status', lbl: t.goalMapStatus },
                        ]}
                        values={gf}
                        props={gProps}
                        mapSection="goal"
                        onLoad={() => fetchProps(String(dbGoal).trim(), 'goal')}
                        onChange={(k, v) => chgGoalField(k, v)}
                        t={t}
                        extraFooter={
                          <GoalStatusPickerBlock
                            t={t}
                            loading={goalStatusOptionsLoading}
                            options={goalStatusOptions}
                            isChecked={isStatusPickerChecked}
                            onToggle={toggleStatusPickerLabel}
                          />
                        }
                      />
                    )}
                  </div>
                  )}
                </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <NotionLoadingOverlay
          open={dbsBlockerVisible || dbsListLoading || (isOAuth && notionDetail && !sessionReady)}
          message={t.loadingDbs}
        />
      </div>
    );
  }

  const accountLineText = (() => {
    if (isLocalMode(creds)) return t.localModeLine;
    if (!hasNotionAuth(creds)) return t.accountLineNotConnected;
    if (creds?.authMode === 'oauth') return creds.workspaceName || (ko ? '워크스페이스' : 'Workspace');
    if (creds?.token) return `${String(creds.token).slice(0, 10)}…`;
    return t.connected;
  })();
  const showConnectionStatusDot = hasNotionAuth(creds);

  const languageValue =
    settings?.lang === 'en' ? 'en' : settings?.lang === 'system' ? 'system' : 'ko';
  const weekValue = settings?.weekStart || 'monday';
  const languageOptions = [
    { value: 'ko', label: t.korean },
    { value: 'en', label: t.english },
    { value: 'system', label: t.system },
  ];
  const weekOptions = [
    { value: 'monday', label: t.weekStartMonday },
    { value: 'sunday', label: t.weekStartSunday },
  ];
  const timeDisplayValue = settings?.timeDisplay === '12' ? '12' : '24';
  const dayWindowSummary = formatDayWindowSummaryHoursOnly(settings);
  const timeFormatOptions = [
    { value: '24', label: t.prefTime24 },
    { value: '12', label: t.prefTime12 },
  ];

  const chevron = <span className="settings-chevron" style={{ color: 'var(--text3)' }} aria-hidden>›</span>;

  return (
    <div className="settings-page" style={{ minHeight: '100%' }}>
      {!inBottomSheet && (
        <div className="page-header" style={{ padding: '8px 16px 16px' }}>
          <h1 className="page-title" style={{ margin: 0 }}>
            {t.settings}
          </h1>
        </div>
      )}
      <div style={{ padding: inBottomSheet ? '8px 16px 36px' : '4px 16px 36px' }}>
        {/* 멤버십 카드 */}
        {subscription?.customer_key && (
          <MembershipCard
            subscription={subscription}
            ko={ko}
            onClick={() => { hapticLight(); setSubscribeSheetOpen(true); }}
          />
        )}
        <SubscribeSheet
          open={subscribeSheetOpen}
          onClose={() => setSubscribeSheetOpen(false)}
          customerKey={subscription?.customer_key}
          ko={ko}
          subscription={subscription}
          onCancelled={() => setSubscription((prev) => ({ ...prev, status: 'cancelled' }))}
        />

        {/* 노션 연결 */}
        <button
          type="button"
          onClick={() => { hapticLight(); setNotionDetail(true); }}
          className="card card--outline card--row-pad w-full flex items-center justify-between gap-list-row mb-stack-md"
          style={{
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'var(--font)',
            color: 'var(--text)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, minWidth: 0 }}>
            <div
              aria-hidden
              style={{
                width: 28,
                height: 28,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Image
                src="/notion-login-mark.png"
                alt=""
                width={28}
                height={28}
                style={{ width: 28, height: 28, objectFit: 'contain' }}
              />
            </div>
            <span style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.2px', whiteSpace: 'nowrap' }}>
              {t.notionConnection}
            </span>
          </div>
          <div className="settings-notion-trail">
            <div className="settings-notion-trail-mid">
              {showConnectionStatusDot && (
                <span className="settings-notion-trail-dot" aria-hidden>●</span>
              )}
              <span className="settings-notion-trail-text truncate">{accountLineText}</span>
            </div>
            {chevron}
          </div>
        </button>

        <div className="sec-label">{t.secPreferences}</div>
        <div className="list-sec list-sec--stack-md">
          <div className="list-row" style={{ borderBottom: '0.5px solid var(--sep)' }}>
            <div className="settings-row-icon"><Globe size={16} strokeWidth={2} /></div>
            <span className="settings-row-label">{t.language}</span>
            <SettingsNativeSelect ariaLabel={t.language} value={languageValue} options={languageOptions}
              onChange={(e) => { hapticLight(); onSaveSettings({ ...settings, lang: e.target.value }); }} />
          </div>
          <div className="list-row" style={{ borderBottom: '0.5px solid var(--sep)' }}>
            <div className="settings-row-icon"><CalendarDays size={16} strokeWidth={2} /></div>
            <span className="settings-row-label">{t.weekStart}</span>
            <SettingsNativeSelect ariaLabel={t.weekStart} value={weekValue} options={weekOptions}
              onChange={(e) => { hapticLight(); onSaveSettings({ ...settings, weekStart: e.target.value }); }} />
          </div>
          <div className="list-row" style={{ borderBottom: '0.5px solid var(--sep)' }}>
            <div className="settings-row-icon"><Sunrise size={16} strokeWidth={2} /></div>
            <span className="settings-row-label truncate" style={{ flex: '1 1 auto', minWidth: 0 }}>
              {t.prefDayWindow}
            </span>
            <button
              type="button"
              className="settings-select-shell"
              aria-expanded={dayWindowOpen}
              aria-haspopup="dialog"
              aria-label={`${t.prefDayWindow}: ${dayWindowSummary}`}
              onClick={() => {
                hapticLight();
                setDayWindowOpen((o) => !o);
              }}
              style={{
                flexShrink: 0,
                marginLeft: 8,
                border: 'none',
                background: 'transparent',
                fontFamily: 'inherit',
                cursor: 'pointer',
                padding: 0,
                maxWidth: '46%',
              }}
            >
              <span className="settings-select-face">{dayWindowSummary}</span>
              <span className="settings-chevron" aria-hidden>›</span>
            </button>
          </div>
          <div className="list-row">
            <div className="settings-row-icon"><Clock size={16} strokeWidth={2} /></div>
            <span className="settings-row-label">{t.prefTimeFormat}</span>
            <SettingsNativeSelect
              ariaLabel={t.prefTimeFormat}
              value={timeDisplayValue}
              options={timeFormatOptions}
              onChange={(e) => {
                hapticLight();
                onSaveSettings({ ...settings, timeDisplay: e.target.value });
              }}
            />
          </div>
        </div>
        <DayWindowDropdown
          open={dayWindowOpen}
          onClose={() => setDayWindowOpen(false)}
          onApply={(patch) => { onSaveSettings({ ...settings, ...patch }); }}
          settings={settings}
          t={t}
          ko={ko}
        />

        <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.45, margin: '14px 4px 18px', paddingLeft: 4 }}>
          {t.prefDayWindowHint}
        </div>

        <div className="sec-label">{t.secSupport}</div>
        <div className="list-sec list-sec--stack-md">
          {[
            { Icon: Mail, label: t.supportSendMail, onClick: () => openSupportEmail({ locale: ko ? 'ko' : 'en', appName: t.appName }), border: true },
            { Icon: MessageSquare, label: t.supportFeedback, onClick: () => window.open(FEEDBACK_URL, '_blank', 'noopener,noreferrer'), border: true },
            { Icon: Megaphone, label: t.newsUpdates, onClick: () => setComingSoonOpen(true), border: false },
          ].map(({ Icon, label, onClick, border }) => (
            <button key={label} type="button" className="list-row w-full"
              style={{ border: 'none', borderBottom: border ? '0.5px solid var(--sep)' : 'none', cursor: 'pointer', background: 'transparent', fontFamily: 'var(--font)' }}
              onClick={() => { hapticLight(); onClick(); }}
            >
              <div className="settings-row-icon"><Icon size={16} strokeWidth={2} /></div>
              <span className="settings-row-label">{label}</span>
              {chevron}
            </button>
          ))}
        </div>

        <div className="sec-label">{t.secLegalPolicy}</div>
        <div className="list-sec list-sec--stack-md">
          {[
            { label: t.privacyPolicy, Icon: Shield, href: PRIVACY_POLICY_URL },
            { label: t.termsOfService, Icon: FileText, href: TERMS_OF_SERVICE_URL },
          ].map(({ label, Icon, href }, i, arr) => (
            <button key={label} type="button" className="list-row w-full"
              style={{ border: 'none', borderBottom: i < arr.length - 1 ? '0.5px solid var(--sep)' : 'none', cursor: 'pointer', background: 'transparent', fontFamily: 'var(--font)' }}
              onClick={() => {
                hapticLight();
                window.open(href, '_blank', 'noopener,noreferrer');
              }}
            >
              <div className="settings-row-icon"><Icon size={16} strokeWidth={2} /></div>
              <span className="settings-row-label">{label}</span>
              {chevron}
            </button>
          ))}
        </div>

        {comingSoonOpen && (
          <PopupDialog
            title={t.comingSoonPopupTitle} message={t.comingSoonPopupBody}
            dismissInHeader closeAriaLabel={t.close}
            onCancel={() => setComingSoonOpen(false)} onConfirm={() => setComingSoonOpen(false)}
            confirmText={t.btnOk} singleAction
          />
        )}

        <div style={{ textAlign: 'center', padding: '24px 0 8px', color: 'var(--text4)', fontSize: 13, fontWeight: 400 }}>
          {t.appName} v{getAppVersionLabel()}
        </div>

        {(isLocalMode(creds) || hasNotionAuth(creds)) && (
          <div style={{ marginTop: 8, paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            <button type="button" onClick={() => { hapticLight(); onDisconnect(); }}
              style={{ background: 'none', border: 'none', width: '100%', textAlign: 'center', padding: '12px 0 0', fontSize: 15, fontWeight: 400, color: 'var(--text3)', cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              {isLocalMode(creds) ? t.backToStart : t.disconnect}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PropRows({ sectionTitle, fields, values, props, mapSection, onLoad, onChange, t, extraFooter, embedInCard }) {
  const names = props.map((p) => p.name);
  const typeMap = new Map(props.map((p) => [p.name, p.type]));
  const [loaded, setLoaded] = useState(names.length > 0);
  useEffect(() => {
    if (names.length > 0) setLoaded(true);
  }, [names.length]);
  const load = async () => {
    await onLoad();
    setLoaded(true);
  };
  return (
    <div
      className={`list-sec${embedInCard ? ' list-sec--prop-embed' : ''}`}
      style={{
        overflow: 'hidden',
        marginBottom: embedInCard ? 0 : 16,
        ...(embedInCard
          ? {
              boxShadow: 'none',
              borderRadius: 0,
              border: 'none',
              background: 'transparent',
            }
          : {}),
      }}
    >
      {embedInCard && t.notionPropMapCaption ? (
        <div className="prop-map-caption">{t.notionPropMapCaption}</div>
      ) : null}
      {String(sectionTitle || '').trim() ? (
        <div className="prop-rows-section-head">
          <div className="settings-row-icon" aria-hidden style={{ visibility: 'hidden' }}>
            <Database size={18} strokeWidth={2} color="var(--text3)" />
          </div>
          <span className="settings-row-label truncate" title={sectionTitle}>
            {sectionTitle}
          </span>
        </div>
      ) : null}
      {fields.map(({ key, lbl }) => {
        const filteredNames = filterPropNamesByExpectedType(
          names,
          typeMap,
          key,
          mapSection,
          values[key] || ''
        );
        return (
          <NotionFieldMapRow
            key={key}
            variant="settings"
            mapSection={mapSection}
            fieldKey={key}
            lbl={lbl}
            val={values[key] || ''}
            names={filteredNames}
            typeMap={typeMap}
            loaded={loaded && names.length > 0}
            onChange={(v) => onChange(key, v)}
            onClickLoad={load}
            titleMissing={t.fieldMapNameMissing}
            titleMismatch={t.fieldMapTypeMismatch}
            titleRequired={t.fieldMapRequired}
          />
        );
      })}
      {extraFooter}
    </div>
  );
}
