'use client';
import { useState, useEffect } from 'react';
import { Check, Search } from 'lucide-react';
import { DEFAULT_TODO_FIELDS, DEFAULT_REPORT_FIELDS } from '@/app/lib/fields';
import DbPicker from './DbPicker';

export default function SettingsTab({ t, creds, settings, onSaveSettings, onSaveCreds, onDisconnect, locale }) {
  const [showRecon, setShowRecon] = useState(false);
  const [token,  setToken]  = useState(creds?.token||'');
  const [dbTodo, setDbTodo] = useState(creds?.dbTodo||'');
  const [dbRep,  setDbRep]  = useState(creds?.dbReport||'');
  const [dbs,    setDbs]    = useState([]);
  const [tProps, setTProps] = useState([]);
  const [rProps, setRProps] = useState([]);
  const [loading,setLoading]= useState(false);
  const [err,    setErr]    = useState('');
  const [saved,  setSaved]  = useState(false);
  const [diagResult, setDiagResult] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const ko = locale==='ko';

  const tf = {...DEFAULT_TODO_FIELDS,  ...(settings?.todoFields||{})};
  const rf = {...DEFAULT_REPORT_FIELDS,...(settings?.reportFields||{})};

  const fetchDbs = async () => {
    setLoading(true); setErr('');
    try {
      const res=await fetch('/api/databases',{headers:{'x-notion-token':token.trim()}});
      const d=await res.json();
      if(!res.ok) throw new Error(d.error||'Failed');
      setDbs(d.databases||[]);
    } catch(e){ setErr(e.message); }
    finally { setLoading(false); }
  };

  const readJsonSafe = async (res) => {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await res.text();
      throw new Error(txt.includes('<!DOCTYPE') ? '서버 라우트 오류(HTML 응답)' : txt || '서버 응답 오류');
    }
    return res.json();
  };

  const fetchProps = async (id,type) => {
    if(!id) return;
    try {
      const res=await fetch(`/api/databases/properties?dbId=${encodeURIComponent(id)}`,{headers:{'x-notion-token':token||creds?.token}});
      const d=await readJsonSafe(res);
      if(!res.ok) throw new Error(d?.error||'Failed');
      if(type==='todo') setTProps(d.properties||[]);
      else              setRProps(d.properties||[]);
    } catch(e){ setErr(e?.message||'Failed'); }
  };

  const handleSave = () => {
    if(!token.trim()||!dbTodo) return;
    onSaveCreds({token:token.trim(),dbTodo,dbReport:dbRep});
    setSaved(true); setTimeout(()=>setSaved(false),2000);
    setShowRecon(false);
  };

  const runDiag = async () => {
    setDiagResult(null);
    setDiagLoading(true);
    try {
      const res = await fetch('/api/test', {
        headers: {
          'x-notion-token': creds?.token || '',
          'x-db-todo': creds?.dbTodo || '',
        },
      });
      const data = await res.json();
      setDiagResult(data);
    } catch(e) {
      setDiagResult({ error: e?.message || String(e), ok: false });
    } finally {
      setDiagLoading(false);
    }
  };

  const chgField = (type,key,val) => {
    if(type==='todo') onSaveSettings({...settings,todoFields:{...tf,[key]:val}});
    else              onSaveSettings({...settings,reportFields:{...rf,[key]:val}});
  };

  const tNames=tProps.map(p=>p.name);
  const rNames=rProps.map(p=>p.name);

  useEffect(() => {
    if (creds?.token && creds?.dbTodo && tProps.length === 0) fetchProps(creds.dbTodo, 'todo');
    if (creds?.token && creds?.dbReport && rProps.length === 0) fetchProps(creds.dbReport, 'report');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds?.token, creds?.dbTodo, creds?.dbReport]);

  return (
    <div style={{minHeight:'100%'}}>
      <div className="page-header">
        <div className="page-title">{t.settings}</div>
      </div>

      <div style={{padding:'0 16px 48px'}}>

        {/* Language */}
        <div className="sec-label">{t.language}</div>
        <div className="list-sec mb-20">
          {[['system',t.system],['ko',t.korean],['en',t.english]].map(([v,lbl])=>(
            <button key={v} className="list-row" style={{width:'100%',border:'none',cursor:'pointer',background:'transparent',fontFamily:'var(--font)'}}
              onClick={()=>onSaveSettings({...settings,lang:v==='system'?null:v})}>
              <span style={{flex:1,textAlign:'left',fontSize:16,color:'var(--text)',fontWeight:500}}>{lbl}</span>
              {(settings?.lang||'system')===v && <Check size={18} strokeWidth={2.1} />}
            </button>
          ))}
        </div>

        <div className="sec-label">{t.weekStart}</div>
        <div className="list-sec mb-20">
          {[['monday', t.weekStartMonday], ['sunday', t.weekStartSunday]].map(([v, lbl]) => (
            <button
              key={v}
              className="list-row"
              style={{width:'100%',border:'none',cursor:'pointer',background:'transparent',fontFamily:'var(--font)'}}
              onClick={() => onSaveSettings({ ...settings, weekStart: v })}
            >
              <span style={{flex:1,textAlign:'left',fontSize:16,color:'var(--text)',fontWeight:500}}>{lbl}</span>
              {(settings?.weekStart || 'monday') === v && <Check size={18} strokeWidth={2.1} />}
            </button>
          ))}
        </div>

        {/* Notion connection */}
        <div className="sec-label">{t.notionConnection}</div>
        <div className="list-sec mb-12">
          <div className="list-row" style={{justifyContent:'space-between'}}>
            <div>
              <div style={{fontSize:16,fontWeight:600,color:'var(--text)'}}>{creds?.token?t.connected:t.notConnected}</div>
              {creds?.token&&<div style={{fontSize:14,color:'var(--text3)',marginTop:2}}>{creds.token.slice(0,16)}…</div>}
            </div>
            <div style={{width:9,height:9,borderRadius:5,background:creds?.token?'var(--green)':'var(--red)'}}/>
          </div>
        </div>

        {!showRecon ? (
          <div style={{display:'flex',gap:8,marginBottom:24}}>
            <button className="btn btn-muted btn-sm flex-1" onClick={()=>setShowRecon(true)}>{t.reconnect}</button>
            {creds?.token&&<button className="btn btn-red btn-sm flex-1" onClick={onDisconnect}>{t.disconnect}</button>}
          </div>
        ) : (
          <div className="card card-p mb-24">
            <div className="stack">
              <div>
                <label className="label">{t.tokenLabel}</label>
                <input className="input" type="password" placeholder={t.tokenPlaceholder} value={token} onChange={e=>setToken(e.target.value)}/>
              </div>
              <button className="btn btn-muted btn-sm" style={{alignSelf:'flex-start'}} onClick={fetchDbs} disabled={!token.trim()||loading}>
                {loading?<span className="spin spin-dark" style={{width:14,height:14}}/>:(ko?'DB 조회':'Load DBs')}
              </button>
              {err&&<div style={{fontSize:13,color:'var(--red)',fontWeight:700}}>{err}</div>}
              {dbs.length>0&&(
                <>
                  <DbPicker label={t.todoDB} value={dbTodo} databases={dbs} onChange={id=>{setDbTodo(id);fetchProps(id,'todo');}} placeholder={t.selectDB}/>
                  <DbPicker label={t.reportDB} value={dbRep} databases={dbs} onChange={id=>{setDbRep(id);fetchProps(id,'report');}} placeholder={t.selectDB}/>
                </>
              )}
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-muted btn-sm flex-1" onClick={()=>setShowRecon(false)}>{t.cancel}</button>
                <button className="btn btn-dark btn-sm flex-1" onClick={handleSave} disabled={!token.trim()||!dbTodo}>
                  {saved?`✓ ${t.saved}`:t.save}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Diagnose button */}
        {creds?.token && (
          <div style={{marginBottom:24}}>
            <button
              className="btn btn-muted btn-sm btn-full"
              onClick={runDiag}
              disabled={diagLoading}
              style={{marginBottom:10}}
            >
              {diagLoading ? <span className="spin spin-dark" style={{width:14,height:14}}/> : <><Search size={14} strokeWidth={2.1} /> {ko?'연결 진단':'Diagnose'}</>}
            </button>
            {diagResult && (
              <div style={{background:'var(--bg3)',borderRadius:12,padding:'12px 14px',fontSize:12,fontFamily:'monospace',wordBreak:'break-all',lineHeight:1.7,color:diagResult.ok?'var(--green)':'var(--red)'}}>
                {diagResult.ok ? '✅ ' + (ko?'연결 정상':'Connected OK') : '❌ ' + (diagResult.error || 'Error')}
                {diagResult.steps && diagResult.steps.map((s,i) => (
                  <div key={i} style={{color:'var(--text3)',marginTop:2}}>
                    {JSON.stringify(s)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* DB Properties */}
        {creds?.token && (
          <>
            <div className="sec-label">{t.dbProperties}</div>
            <PropRows label={t.todoDB} dbId={creds.dbTodo} tokenStr={token||creds.token}
              fields={[{key:'name',lbl:t.fieldName},{key:'date',lbl:t.fieldDate},{key:'done',lbl:t.fieldDone},{key:'accum',lbl:t.fieldAccum}]}
              values={tf} names={tNames} onLoad={()=>fetchProps(creds.dbTodo,'todo')} onChange={(k,v)=>chgField('todo',k,v)} t={t}/>
            {creds.dbReport&&(
              <PropRows label={t.reportDB} dbId={creds.dbReport} tokenStr={token||creds.token}
                fields={[{key:'review',lbl:t.fieldReview},{key:'totalMin',lbl:t.fieldTotalMin}]}
                values={rf} names={rNames} onLoad={()=>fetchProps(creds.dbReport,'report')} onChange={(k,v)=>chgField('report',k,v)} t={t}/>
            )}
          </>
        )}

        <div style={{textAlign:'center',padding:'32px 0 8px',color:'var(--text4)',fontSize:12,fontWeight:700}}>
          노크 순공타이머 v1.0.0
        </div>
      </div>
    </div>
  );
}

function PropRows({label,fields,values,names,onLoad,onChange,t}) {
  const [loaded,setLoaded]=useState(names.length>0);
  useEffect(() => {
    if (names.length > 0) setLoaded(true);
  }, [names.length]);
  const load=async()=>{ await onLoad(); setLoaded(true); };
  return (
    <>
      <div style={{fontSize:12,color:'var(--text3)',fontWeight:700,padding:'12px 2px 6px'}}>{label}</div>
      <div className="list-sec mb-16">
        {fields.map(({key,lbl})=>{
          const val=values[key]||'';
          const bad=loaded&&names.length>0&&!names.includes(val);
          return (
            <div key={key} className="list-row" style={{gap:12,flexWrap:'wrap'}}>
              <span style={{fontSize:15,fontWeight:600,color:bad?'var(--red)':'var(--text)',minWidth:90}}>
                {lbl}{bad?' ⚠':''}
              </span>
              {loaded&&names.length>0 ? (
                <select className="input" style={{flex:1,padding:'7px 12px',fontSize:16,fontWeight:400}} value={val} onChange={e=>onChange(key,e.target.value)}>
                  <option value="">{t.selectProperty}</option>
                  {names.map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              ) : (
                <span style={{flex:1,fontSize:16,color:'var(--text)',cursor:'pointer',fontWeight:500,opacity:.5}} onClick={load}>{val||t.selectProperty}</span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
