import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownLeft, ArrowLeft, ArrowRight, Braces, Check, ChevronDown, CircleHelp, Clock3, Copy, ExternalLink, FileJson, Globe2, Layers3, LoaderCircle, Moon, Play, Plus, RefreshCw, Search, Sun, Terminal, Trash2, WandSparkles, X, Zap } from 'lucide-react';

const examples = [
  { label: 'Hacker News headlines', url: 'https://news.ycombinator.com', goal: 'Extract the top 10 stories with title, points, author, and story URL.' },
  { label: 'TinyFish homepage', url: 'https://tinyfish.ai', goal: 'Find the main product description, key features, and links to documentation.' },
  { label: 'Product listings', url: 'https://books.toscrape.com', goal: 'Extract the first 8 books with title, price, rating, and availability.' }
];
const cx = (...xs) => xs.filter(Boolean).join(' ');
const pretty = (value) => JSON.stringify(value, null, 2);
const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function IconButton({ title, onClick, children, className = '' }) { return <button className={cx('icon-button', className)} title={title} aria-label={title} onClick={onClick}>{children}</button>; }
function App() {
  const [dark, setDark] = useState(() => window.localStorage.getItem('siteapi-theme') === 'dark');
  const [url, setUrl] = useState('https://news.ycombinator.com');
  const [goal, setGoal] = useState('Extract the top 10 stories with title, points, author, and story URL.');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [events, setEvents] = useState([]);
  const [result, setResult] = useState(null);
  const [resultUrl, setResultUrl] = useState('');
  const [error, setError] = useState('');
  const [endpoints, setEndpoints] = useState([]);
  const [epLoading, setEpLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState('builder');
  const [raw, setRaw] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('Hacker News stories');
  const [saveBusy, setSaveBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [activeEndpoint, setActiveEndpoint] = useState(null);
  const [endpointResult, setEndpointResult] = useState(null);
  const [callBusy, setCallBusy] = useState(false);
  const [liveUrl, setLiveUrl] = useState('');
  const eventRef = useRef(null);

  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; window.localStorage.setItem('siteapi-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => { loadEndpoints(); }, []);
  useEffect(() => { if (notice) { const id = setTimeout(() => setNotice(''), 3000); return () => clearTimeout(id); } }, [notice]);

  async function loadEndpoints() {
    setEpLoading(true);
    try { const r = await fetch('/api/endpoints'); const d = await r.json(); setEndpoints(Array.isArray(d) ? d : (d.endpoints || [])); }
    catch { setEndpoints([]); }
    finally { setEpLoading(false); }
  }
  function addEvent(message, type = 'info') { setEvents(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), message, type }]); }
  function useExample(ex) { setUrl(ex.url); setGoal(ex.goal); setPage('builder'); setResult(null); setError(''); }
  async function runExtraction(e) {
    e?.preventDefault();
    if (!url.trim() || !goal.trim()) { setError('Add a website URL and describe the data you want.'); return; }
    setBusy(true); setPhase('running'); setPage('builder'); setError(''); setResult(null); setLiveUrl(''); setEvents([]); addEvent('Extraction queued', 'success'); addEvent(`Connecting to ${url}`, 'info');
    try {
      const response = await fetch('/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim(), goal: goal.trim() }) });
      if (!response.ok) { const t = await response.text(); throw new Error(t || `Request failed (${response.status})`); }
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (true) {
          const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split(/\n\n/); buffer = chunks.pop() || '';
          for (const chunk of chunks) {
            const dataLine = chunk.split('\n').find(line => line.startsWith('data:'));
            if (!dataLine) continue;
            const payload = dataLine.slice(5).trim(); if (!payload) continue;
            let event; try { event = JSON.parse(payload); } catch { addEvent(payload); continue; }
            const type = String(event.type || event.event || event.name || '').toUpperCase();
            const message = event.message || event.status || event.step || event.type || 'Working…';
            const stream = event.streamingUrl || event.streaming_url || event.browserUrl || event.liveUrl || event.live_url;
            if (stream) setLiveUrl(stream);
            if (type.includes('RESULT') || event.SITEAPI_RESULT !== undefined) {
              const data = event.SITEAPI_RESULT ?? event.result ?? event.data ?? event;
              setResult(data); setResultUrl(url); setPhase('complete'); addEvent('Structured result received', 'success');
            } else if (event.error || type.includes('ERROR')) { throw new Error(event.error || message); }
            else addEvent(String(message), 'info');
          }
        }
      } else {
        const data = await response.json();
        const final = data.SITEAPI_RESULT ?? data.result ?? data.data ?? data;
        if (data.error) throw new Error(data.error);
        setResult(final); setResultUrl(url); setPhase('complete'); addEvent('Structured result received', 'success');
        const stream = data.streamingUrl || data.streaming_url || data.browserUrl || data.liveUrl; if (stream) setLiveUrl(stream);
      }
      if (phase !== 'complete' && !result) { /* streamed result may have arrived during the read */ }
      setNotice('Extraction finished');
    } catch (err) { setError(err.message || 'Something went wrong.'); setPhase('error'); addEvent(err.message || 'Extraction failed', 'error'); }
    finally { setBusy(false); }
  }
  const resultData = endpointResult ?? result;
  const filteredEndpoints = useMemo(() => endpoints.filter(ep => `${ep.name || ''} ${ep.slug || ''} ${ep.url || ''}`.toLowerCase().includes(filter.toLowerCase())), [endpoints, filter]);
  async function copyText(text) { try { await navigator.clipboard.writeText(text); setNotice('Copied to clipboard'); } catch { setNotice('Clipboard access was blocked'); } }
  function downloadCsv(data) {
    const rows = Array.isArray(data) ? data : (data && typeof data === 'object' ? (Array.isArray(data.items) ? data.items : [data]) : [{ value: data }]);
    if (!rows.length) return;
    const keys = [...new Set(rows.flatMap(row => row && typeof row === 'object' ? Object.keys(row) : ['value']))];
    const csv = [keys, ...rows.map(row => keys.map(key => { const value = row?.[key] ?? ''; return `"${(typeof value === 'object' ? JSON.stringify(value) : String(value)).replaceAll('"', '""')}"`; }))].map(row => row.join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); a.download = 'siteapi-data.csv'; a.click(); URL.revokeObjectURL(a.href);
  }
  async function saveEndpoint(e) {
    e?.preventDefault(); if (!name.trim() || !result) return;
    setSaveBusy(true);
    try {
      const r = await fetch('/api/endpoints', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), url: resultUrl || url, goal, sample: result }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.detail || d.error || 'Could not save endpoint');
      setSaveOpen(false); setNotice('Endpoint saved'); await loadEndpoints();
    } catch (err) { setNotice(err.message); }
    finally { setSaveBusy(false); }
  }
  async function callEndpoint(ep) {
    const slug = ep.slug || ep.id; if (!slug) return;
    setCallBusy(true); setActiveEndpoint(ep); setEndpointResult(null); setPage('endpoint');
    try { const r = await fetch(`/v1/${encodeURIComponent(slug)}`); const d = await r.json(); if (!r.ok) throw new Error(d.detail || 'Endpoint call failed'); setEndpointResult(d); setNotice('Endpoint response loaded'); }
    catch (err) { setError(err.message); setEndpointResult({ error: err.message }); }
    finally { setCallBusy(false); }
  }
  async function deleteEndpoint(ep) {
    const slug = ep.slug || ep.id; if (!slug || !window.confirm(`Delete “${ep.name || slug}”?`)) return;
    try { const r = await fetch(`/api/endpoints/${encodeURIComponent(slug)}`, { method: 'DELETE' }); if (!r.ok) throw new Error('Delete failed'); setNotice('Endpoint deleted'); await loadEndpoints(); }
    catch (err) { setNotice(err.message); }
  }
  const activeData = page === 'endpoint' ? endpointResult : result;

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#home" onClick={e => { e.preventDefault(); setPage('builder'); }}><span className="brand-mark"><Braces size={20}/></span><span>site<span className="brand-accent">api</span></span><span className="brand-version">BETA</span></a><nav className="topnav"><button className={cx('nav-link', page !== 'endpoints' && 'selected')} onClick={() => setPage('builder')}>Workspace</button><button className={cx('nav-link', page === 'endpoints' && 'selected')} onClick={() => { setPage('endpoints'); loadEndpoints(); }}>Endpoints <span className="nav-count">{endpoints.length}</span></button></nav><div className="top-actions"><span className="connection"><span className="status-dot"/> API connected</span><IconButton title={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setDark(v => !v)}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</IconButton><a className="github-link" href="https://github.com/MayannkTiwari/siteapi" target="_blank" rel="noreferrer">GitHub <ExternalLink size={13}/></a></div></header>
    <main className="main-wrap">
      {page === 'builder' && <>
        <section className="intro"><div className="eyebrow"><span className="eyebrow-line"/> WEB DATA WORKSPACE</div><h1>From website to <span>API.</span></h1><p className="intro-copy">Tell SiteAPI what to find. Get structured data you can use anywhere.</p><div className="intro-meta"><span><Zap size={14}/> Natural-language extraction</span><span><Braces size={14}/> JSON output</span><span><Layers3 size={14}/> Reusable endpoints</span></div></section>
        <div className="workspace-grid">
          <section className="left-column">
            <div className="panel builder-panel"><div className="panel-heading"><div className="step-icon">01</div><div><h2>Configure extraction</h2><p>Choose a source and describe the result you need.</p></div><span className="panel-tag"><WandSparkles size={13}/> Agent setup</span></div>
              <form onSubmit={runExtraction} className="builder-form"><label htmlFor="site-url">Website URL</label><div className="url-input-wrap"><Globe2 size={17}/><input id="site-url" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" required/><button type="button" className="clear-input" onClick={() => setUrl('')} aria-label="Clear URL"><X size={15}/></button></div><label htmlFor="goal">What should we extract?</label><textarea id="goal" rows="4" value={goal} onChange={e => setGoal(e.target.value)} placeholder="Describe the information you want in plain English..." required/><div className="prompt-foot"><span>Be specific about fields and quantity.</span><span>{goal.length} characters</span></div><div className="examples"><span className="field-caption">TRY AN EXAMPLE</span>{examples.map(ex => <button type="button" key={ex.label} className="example-chip" onClick={() => useExample(ex)}>{ex.label}<ArrowDownLeft size={13}/></button>)}</div><div className="form-footer"><span className="secure-note"><span className="status-dot"/> Runs on your configured TinyFish connection</span><button className="primary-button" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={16} className="spin"/> Extracting</> : <><Play size={15} fill="currentColor"/> Run extraction <ArrowRight size={15}/></>}</button></div></form>
            </div>
            <div className="panel activity-panel"><div className="panel-heading compact"><div className="step-icon subdued"><Activity size={16}/></div><div><h2>Run activity</h2><p>Live updates from the extraction process.</p></div><span className={cx('run-state', phase)}><span className="status-dot"/>{phase === 'running' ? 'Running' : phase === 'complete' ? 'Completed' : phase === 'error' ? 'Failed' : 'Ready'}</span></div>
              {error && <div className="error-banner"><CircleHelp size={16}/><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={14}/></button></div>}
              <div className="event-list" ref={eventRef}>{events.length ? events.map(ev => <div className="event-row" key={ev.id}><span className={cx('event-icon', ev.type)}>{ev.type === 'success' ? <Check size={13}/> : ev.type === 'error' ? <X size={13}/> : <span className="event-tick"/>}</span><span className="event-message">{ev.message}</span><time>{ev.time}</time></div>) : <div className="empty-activity"><span className="empty-pulse"><Activity size={18}/></span><span>Waiting for a run</span><small>Start an extraction to see progress here.</small></div>}</div>
              {liveUrl && <div className="live-link"><span><Globe2 size={14}/> Live browser session available</span><a href={liveUrl} target="_blank" rel="noreferrer">Open session <ExternalLink size={12}/></a></div>}
            </div>
          </section>
          <aside className="right-column"><div className="panel endpoints-panel"><div className="side-heading"><div><div className="side-title"><Layers3 size={16}/><h2>Saved endpoints</h2></div><p>Your reusable data routes.</p></div><button className="small-icon" title="Refresh endpoints" onClick={loadEndpoints}><RefreshCw size={15} className={epLoading ? 'spin' : ''}/></button></div><div className="endpoint-search"><Search size={15}/><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find an endpoint..." aria-label="Search endpoints"/></div><div className="endpoint-list">{epLoading ? <div className="side-empty"><LoaderCircle size={18} className="spin"/> Loading endpoints</div> : filteredEndpoints.length ? filteredEndpoints.map((ep, i) => <div className="endpoint-card" key={ep.slug || ep.id || i}><div className="endpoint-symbol"><Braces size={16}/></div><div className="endpoint-info"><strong>{ep.name || ep.slug || 'Untitled endpoint'}</strong><span><code>GET</code> /v1/{ep.slug || ep.id}</span><small>{ep.url || 'Saved extraction'}</small></div><div className="endpoint-actions"><IconButton title="Call endpoint" onClick={() => callEndpoint(ep)}><Play size={13}/></IconButton><IconButton title="Copy endpoint URL" onClick={() => copyText(`${window.location.origin}/v1/${ep.slug || ep.id}`)}><Copy size={13}/></IconButton><IconButton title="Delete endpoint" onClick={() => deleteEndpoint(ep)}><Trash2 size={13}/></IconButton></div></div>) : <div className="side-empty"><span className="empty-stack"><Layers3 size={19}/></span><strong>{filter ? 'No matches found' : 'Nothing saved yet'}</strong><span>{filter ? 'Try another search.' : 'Run an extraction, then save its result as a reusable endpoint.'}</span></div>}</div><div className="endpoint-panel-foot"><span><span className="status-dot"/> Local endpoint registry</span><button onClick={() => { setPage('endpoints'); loadEndpoints(); }}>Manage all <ArrowRight size={13}/></button></div></div>
            <div className="hint-card"><div className="hint-icon"><Terminal size={17}/></div><div><strong>Built for your workflow</strong><p>Save a result once, then call it like a regular REST API.</p><button onClick={() => setPage('endpoints')}>Explore endpoints <ArrowRight size={13}/></button></div></div>
            <div className="quick-stats"><div><span>ENGINE</span><strong>TinyFish</strong></div><div><span>RESPONSE</span><strong>JSON</strong></div><div><span>BACKEND</span><strong>FastAPI</strong></div></div>
          </aside>
        </div>
        {result && <section className="panel result-panel"><div className="result-heading"><div className="panel-heading compact"><div className="step-icon success-step"><Check size={17}/></div><div><h2>Extraction result</h2><p>Structured data returned from <span className="mono">{resultUrl}</span></p></div></div><div className="result-actions"><button className="secondary-button" onClick={() => setRaw(v => !v)}><Braces size={14}/>{raw ? 'Formatted view' : 'Raw JSON'}</button><button className="secondary-button" onClick={() => downloadCsv(result)}><ArrowDownLeft size={14}/> Export CSV</button><button className="secondary-button" onClick={() => copyText(pretty(result))}><Copy size={14}/> Copy JSON</button><button className="primary-button small-primary" onClick={() => { setName((new URL(resultUrl || url)).hostname.replace(/^www\./, '') + ' data'); setSaveOpen(true); }}><Plus size={14}/> Save endpoint</button></div></div><ResultView data={result} raw={raw}/></section>}
      </>}
      {page === 'endpoints' && <section className="management-page"><div className="page-topline"><button className="back-link" onClick={() => setPage('builder')}><ArrowLeft size={15}/> Workspace</button><span className="eyebrow">API REGISTRY</span></div><div className="page-title-row"><div><h1>Your endpoints</h1><p>Saved extractions, ready to call from your app or terminal.</p></div><button className="secondary-button" onClick={loadEndpoints}><RefreshCw size={14}/> Refresh</button></div><div className="panel registry-panel"><div className="registry-toolbar"><div className="endpoint-search wide-search"><Search size={15}/><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search by name, URL, or slug..."/></div><span className="registry-count">{filteredEndpoints.length} endpoint{filteredEndpoints.length === 1 ? '' : 's'}</span></div>{filteredEndpoints.length ? <div className="registry-list">{filteredEndpoints.map((ep, i) => <div className="registry-row" key={ep.slug || ep.id || i}><div className="endpoint-symbol large-symbol"><Braces size={18}/></div><div className="registry-details"><strong>{ep.name || ep.slug}</strong><span>{ep.url || 'Source URL unavailable'}</span><code>GET /v1/{ep.slug || ep.id}</code></div><div className="registry-actions"><button className="secondary-button" onClick={() => callEndpoint(ep)}><Play size={14}/> Call API</button><button className="secondary-button" onClick={() => copyText(`curl ${window.location.origin}/v1/${ep.slug || ep.id}`)}><Copy size={14}/> Copy cURL</button><IconButton title="Delete endpoint" onClick={() => deleteEndpoint(ep)}><Trash2 size={15}/></IconButton></div></div>)}</div> : <div className="registry-empty"><Layers3 size={26}/><h3>No endpoints yet</h3><p>Build an extraction and save it to create your first reusable route.</p><button className="primary-button" onClick={() => setPage('builder')}>Create an extraction <ArrowRight size={15}/></button></div>}</div></section>}
      {page === 'endpoint' && <section className="management-page"><div className="page-topline"><button className="back-link" onClick={() => { setPage('endpoints'); setEndpointResult(null); }}><ArrowLeft size={15}/> All endpoints</button><span className="eyebrow">LIVE RESPONSE</span></div><div className="page-title-row"><div><h1>{activeEndpoint?.name || 'Endpoint response'}</h1><p><code className="route-code">GET /v1/{activeEndpoint?.slug || activeEndpoint?.id}</code></p></div><button className="secondary-button" onClick={() => activeEndpoint && callEndpoint(activeEndpoint)} disabled={callBusy}><RefreshCw size={14} className={callBusy ? 'spin' : ''}/> Run again</button></div><div className="panel response-panel">{callBusy ? <div className="response-loading"><LoaderCircle size={23} className="spin"/><span>Calling saved endpoint…</span></div> : endpointResult && <><div className="result-toolbar"><span className="success-label"><span className="status-dot"/> Response received</span><div className="result-actions"><button className="secondary-button" onClick={() => copyText(pretty(endpointResult))}><Copy size={14}/> Copy JSON</button><button className="secondary-button" onClick={() => downloadCsv(endpointResult)}><ArrowDownLeft size={14}/> Export CSV</button></div></div><ResultView data={endpointResult} raw={raw}/></>}</div></section>}
      <footer className="footer"><div className="footer-brand"><span className="brand-mark small-mark"><Braces size={14}/></span><span>siteapi</span></div><span>Website data, ready to use.</span><span className="footer-right"><span className="status-dot"/> Running locally <span className="footer-divider">·</span> FastAPI + TinyFish</span></footer>
    </main>
    {saveOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSaveOpen(false); }}><form className="save-modal" onSubmit={saveEndpoint}><div className="modal-head"><div className="modal-icon"><Layers3 size={18}/></div><button type="button" className="small-icon" onClick={() => setSaveOpen(false)} aria-label="Close"><X size={17}/></button></div><h2>Save as an endpoint</h2><p>Give this extraction a clear name. You can call it again using a simple GET request.</p><label htmlFor="endpoint-name">Endpoint name</label><input id="endpoint-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Latest product prices" required autoFocus/><div className="slug-preview"><span>ROUTE PREVIEW</span><code>GET /v1/{slugify(name) || 'your-endpoint'}</code></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setSaveOpen(false)}>Cancel</button><button className="primary-button" disabled={saveBusy}>{saveBusy ? <LoaderCircle size={15} className="spin"/> : <Check size={15}/>} Save endpoint</button></div></form></div>}
    {notice && <div className="toast"><Check size={15}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={13}/></button></div>}
  </div>;
}
function ResultView({ data, raw }) {
  if (raw || data === null || typeof data !== 'object') return <pre className="json-view">{pretty(data)}</pre>;
  const rows = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : Array.isArray(data.results) ? data.results : null;
  const fields = rows?.length && rows[0] && typeof rows[0] === 'object' ? [...new Set(rows.flatMap(row => Object.keys(row)))].slice(0, 6) : null;
  return <div className="data-view">{fields ? <><div className="data-summary"><span><FileJson size={15}/> Structured records</span><strong>{rows.length} rows</strong></div><div className="table-scroll"><table><thead><tr>{fields.map(f => <th key={f}>{f.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{fields.map(f => <td key={f}>{renderValue(row?.[f])}</td>)}</tr>)}</tbody></table></div><details className="nested-json"><summary>View complete JSON <ChevronDown size={14}/></summary><pre className="json-view">{pretty(data)}</pre></details></> : <div className="object-grid">{Object.entries(data).map(([key, value]) => <div className="object-field" key={key}><span>{key.replaceAll('_', ' ')}</span><div>{renderValue(value)}</div></div>)}</div>}</div>;
}
function renderValue(value) {
  if (value === null || value === undefined || value === '') return <span className="muted-value">—</span>;
  if (typeof value === 'boolean') return <span className={cx('boolean-value', value ? 'true' : 'false')}>{String(value)}</span>;
  if (typeof value === 'object') return <code className="inline-json">{JSON.stringify(value)}</code>;
  if (typeof value === 'string' && /^https?:\/\//.test(value)) return <a className="data-link" href={value} target="_blank" rel="noreferrer">{value.replace(/^https?:\/\//, '').slice(0, 60)}{value.length > 60 ? '…' : ''} <ExternalLink size={11}/></a>;
  return String(value);
}
export default App;
