import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  CloudUpload,
  Database,
  FileCheck2,
  FileText,
  Filter,
  Gauge,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  Server,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  WifiOff,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  DEFAULT_SETTINGS,
  fetchDashboard,
  fetchHealth,
  MAX_FILE_SIZE_MB,
  uploadLogFile,
} from './lib/api';
import type {
  ApiSettings,
  DashboardData,
  ModelMetadata,
  PredictionResult,
} from './types';

const EMPTY_DASHBOARD: DashboardData = {
  metrics: { totalRecords: 0, normalCount: 0, anomalyCount: 0 },
  results: [],
  model: {
    status: 'unknown',
    name: 'RandomForestClassifier',
    featureCount: 31,
    sklearnVersion: '1.6.1',
    classMapping: { normal: 'Success', anomaly: 'Fail' },
  },
  hasAnalysis: false,
};

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'upload', label: 'Analyze File', icon: CloudUpload },
  { id: 'events', label: 'Prediction Log', icon: ShieldAlert },
  { id: 'settings', label: 'Connection Settings', icon: Settings2 },
] as const;

type ViewId = (typeof NAV_ITEMS)[number]['id'];
type ResultFilter = 'all' | 'normal' | 'anomaly';

const CLASS_COLORS = {
  normal: '#2ac7a8',
  anomaly: '#ff7585',
};

function getLocationView(): ViewId {
  const requested = new URLSearchParams(window.location.search).get('view');
  return NAV_ITEMS.some((item) => item.id === requested)
    ? (requested as ViewId)
    : 'overview';
}

function readSettings(): ApiSettings {
  try {
    const saved = localStorage.getItem('cloudshield-api-settings');
    if (!saved) return DEFAULT_SETTINGS;
    const raw: unknown = JSON.parse(saved);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_SETTINGS;
    const parsed = raw as Partial<ApiSettings>;
    const size = typeof parsed.maxFileSizeMb === 'number' && Number.isFinite(parsed.maxFileSizeMb)
      ? Math.max(1, Math.min(MAX_FILE_SIZE_MB, parsed.maxFileSizeMb))
      : MAX_FILE_SIZE_MB;
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : DEFAULT_SETTINGS.baseUrl,
      analyzePath: typeof parsed.analyzePath === 'string' && parsed.analyzePath.trim()
        ? parsed.analyzePath
        : DEFAULT_SETTINGS.analyzePath,
      dashboardPath: typeof parsed.dashboardPath === 'string' && parsed.dashboardPath.trim()
        ? parsed.dashboardPath
        : DEFAULT_SETTINGS.dashboardPath,
      healthPath: typeof parsed.healthPath === 'string' && parsed.healthPath.trim()
        ? parsed.healthPath
        : DEFAULT_SETTINGS.healthPath,
      fileField: 'file',
      maxFileSizeMb: size,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDate(value?: string): string {
  if (!value) return 'No analysis yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function OverviewPage({
  data,
  loading,
  error,
  onRetry,
  onNavigate,
}: {
  data: DashboardData;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onNavigate: (view: ViewId) => void;
}) {
  const { metrics } = data;
  const modelReady = data.model.status === 'ready' && !error;
  const anomalyResults = data.results.filter((item) => item.prediction === 1);
  const distribution = [
    { key: 'normal', label: 'Normal · Success (0)', count: metrics.normalCount, fill: CLASS_COLORS.normal },
    { key: 'anomaly', label: 'Anomaly · Fail (1)', count: metrics.anomalyCount, fill: CLASS_COLORS.anomaly },
  ];
  const cards = [
    { title: 'Rows Analyzed', value: metrics.totalRecords, icon: FileText, tone: 'teal', foot: 'From the uploaded CSV' },
    { title: 'Normal · Success', value: metrics.normalCount, icon: CheckCircle2, tone: 'blue', foot: 'Model class 0' },
    { title: 'Anomaly · Fail', value: metrics.anomalyCount, icon: Activity, tone: 'red', foot: 'Model class 1' },
  ];

  return (
    <div className="page-stack overview-page">
      {error && (
        <div className="inline-error" role="alert">
          <WifiOff size={18} />
          <span>{error}</span>
          <button onClick={onRetry} className="text-button" type="button">Retry connection</button>
        </div>
      )}

      <section className="overview-hero">
        <div className="overview-intro">
          <div className="eyebrow"><span className="live-dot" /> SECURITY OPERATIONS / MODEL MONITORING</div>
          <h1>Operations Overview</h1>
          <p className="page-lede">Review real CSV predictions from the trained Random Forest model.</p>
          <div className="hero-actions">
            <span className={`mode-pill ${modelReady ? 'connected' : 'unavailable'}`}>
              <Server size={14} /> {modelReady ? 'Live Model Connected' : loading ? 'Checking Model' : 'Model Unavailable'}
            </span>
            <button className="button button-primary" onClick={() => onNavigate('upload')} type="button">
              <Upload size={17} /> Analyze CSV <ArrowRight size={15} />
            </button>
          </div>
        </div>
        <div className="hero-risk-panel model-status-panel">
          <div className="hero-risk-copy">
            <span className="hero-risk-kicker"><Gauge size={15} /> Random Forest Status</span>
            <strong className="hero-risk-value">{loading ? 'Checking…' : modelReady ? 'Ready' : 'Offline'}</strong>
            <span className={`risk-tag ${modelReady ? '' : 'risk-high'}`}>
              {modelReady ? `${formatNumber(data.model.featureCount)} trained features` : 'No predictions available'}
            </span>
          </div>
          <svg className="risk-ring hero-risk-ring" viewBox="0 0 100 100" aria-label={modelReady ? 'Random Forest model ready' : 'Model status unknown'}>
            <circle className="risk-track" cx="50" cy="50" r="42" />
            <circle className="risk-progress" cx="50" cy="50" r="42" strokeDasharray={modelReady ? '264 264' : '0 264'} />
            <text x="50" y="55" textAnchor="middle">RF</text>
          </svg>
          <span className="risk-orbit" aria-hidden="true" />
        </div>
      </section>

      {!loading && !error && !data.hasAnalysis && (
        <div className="empty-api">
          <Server size={19} />
          <span>The API is ready, but no CSV has been analyzed in this browser session yet. No sample predictions are shown.</span>
          <button className="text-button" onClick={() => onNavigate('upload')} type="button">Upload a CSV</button>
        </div>
      )}

      <section className="metrics-grid" aria-label="Model results">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="metric-card metric-strip-item" key={card.title}>
              <div className="metric-top"><span className={`metric-icon ${card.tone}`}><Icon size={19} /></span></div>
              <div className="metric-label">{card.title}</div>
              <div className="metric-value">{loading ? <span className="skeleton-value" /> : formatNumber(card.value)}</div>
              <div className="metric-foot"><span className={`foot-dot ${card.tone}`} />{card.foot}</div>
            </article>
          );
        })}
      </section>

      <section className="dashboard-columns">
        <div className="primary-column">
          <article className="panel trend-panel">
            <div className="panel-heading">
              <div>
                <div className="panel-title">Random Forest Predictions</div>
                <div className="panel-subtitle">Actual rows returned for each trained class</div>
              </div>
              <span className="period-button">Model output</span>
            </div>
            {data.hasAnalysis ? (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distribution} layout="vertical" margin={{ top: 10, right: 20, left: 8, bottom: 8 }}>
                    <CartesianGrid stroke="#24394b" horizontal={false} />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#90a6b8', fontSize: 11 }} />
                    <YAxis type="category" dataKey="label" width={150} axisLine={false} tickLine={false} tick={{ fill: '#c5d3df', fontSize: 11 }} />
                    <Tooltip
                      formatter={(value) => [formatNumber(Number(value)), 'records']}
                      contentStyle={{ border: '1px solid #2b4356', borderRadius: 12, direction: 'ltr', fontFamily: 'inherit', color: '#e3edf5', backgroundColor: '#102030', boxShadow: '0 12px 32px rgba(0,0,0,.35)' }}
                    />
                    <Bar dataKey="count" name="Rows" radius={[0, 8, 8, 0]} isAnimationActive={false}>
                      {distribution.map((item) => <Cell key={item.key} fill={item.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="chart-empty"><BarChart3 size={28} /><span>{loading ? 'Loading model status…' : 'Upload a CSV to see actual predictions'}</span></div>
            )}
            <div className="chart-legend">
              <span><i className="legend-dot logs" />Success / Normal · class 0</span>
              <span><i className="legend-dot anomaly" />Fail / Anomaly · class 1</span>
            </div>
          </article>
        </div>

        <aside className="insight-column">
          <article className="panel severity-panel">
            <div className="panel-heading">
              <div><div className="panel-title">Class Distribution</div><div className="panel-subtitle">Labels defined by the training notebook</div></div>
              <span className="icon-button chart-info" title="Real Random Forest prediction counts" aria-label="Real Random Forest prediction counts"><CircleHelp size={17} /></span>
            </div>
            {data.hasAnalysis ? (
              <div className="donut-area">
                <div className="donut-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={distribution} dataKey="count" nameKey="label" innerRadius="70%" outerRadius="94%" paddingAngle={4} stroke="none" cornerRadius={5} isAnimationActive={false}>
                        {distribution.map((item) => <Cell key={item.key} fill={item.fill} />)}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [formatNumber(Number(value)), 'records']}
                        contentStyle={{ border: '1px solid #2b4356', borderRadius: 10, direction: 'ltr', fontFamily: 'inherit', color: '#e3edf5', backgroundColor: '#102030' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center"><strong>{formatNumber(metrics.totalRecords)}</strong><span>rows</span></div>
                </div>
                <div className="severity-legend">
                  {distribution.map((item) => (
                    <div className="severity-row" key={item.key}>
                      <span className="severity-name"><i style={{ background: item.fill }} />{item.label}</span>
                      <strong>{formatNumber(item.count)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="chart-empty short"><ShieldCheck size={26} /><span>Class counts appear after a real CSV analysis</span></div>
            )}
          </article>

          <ModelContractPanel model={data.model} />
        </aside>
      </section>

      <section className="panel anomalies-panel">
        <div className="panel-heading anomalies-heading">
          <div>
            <div className="panel-title">Anomaly Predictions</div>
            <div className="panel-subtitle">
              {data.hasAnalysis
                ? `Showing ${formatNumber(Math.min(anomalyResults.length, 5))} of ${formatNumber(metrics.anomalyCount)} actual Fail predictions`
                : 'No prediction rows until a CSV is analyzed'}
            </div>
          </div>
          <button className="button button-quiet" onClick={() => onNavigate('events')} type="button">View prediction log <ArrowRight size={15} /></button>
        </div>
        <PredictionTable results={anomalyResults.slice(0, 5)} emptyMessage="The trained model returned no class 1 / Fail rows for this CSV." />
      </section>

      <div className="last-updated"><Clock3 size={14} /> Last analyzed: {formatDate(data.analyzedAt)} {loading && <LoaderCircle className="spin" size={14} />}</div>
    </div>
  );
}

function ModelContractPanel({ model }: { model: DashboardData['model'] }) {
  const modelReady = model.status === 'ready';
  return (
    <article className="panel priority-panel model-contract-panel">
      <div className="panel-heading priority-heading">
        <div><div className="panel-title">Verified Model Contract</div><div className="panel-subtitle">Read from the supplied training code</div></div>
        <span className="priority-count">{modelReady ? formatNumber(model.featureCount) : '31'}</span>
      </div>
      <div className="priority-list">
        <article className="priority-event">
          <div className="priority-event-meta"><span className="prediction-badge normal"><i />Class 0</span><span>Success</span></div>
          <strong>Normal classification</strong>
          <span className="priority-source"><CheckCircle2 size={13} /> Mapped from the trained label</span>
        </article>
        <article className="priority-event">
          <div className="priority-event-meta"><span className="prediction-badge anomaly"><i />Class 1</span><span>Fail</span></div>
          <strong>Anomaly classification</strong>
          <span className="priority-source"><AlertTriangle size={13} /> Mapped from the trained label</span>
        </article>
      </div>
      <div className="contract-runtime">
        <span><strong>Feature order</strong><code>E1–E29, Type_y, Latency</code></span>
        <span><strong>Preprocessing</strong><code>Missing values → 0 · no scaling</code></span>
        <span><strong>Runtime</strong><code>{modelReady ? `scikit-learn ${model.sklearnVersion}` : 'Awaiting API health check'}</code></span>
      </div>
    </article>
  );
}

function PredictionTable({
  results,
  emptyMessage,
}: {
  results: PredictionResult[];
  emptyMessage: string;
}) {
  if (!results.length) {
    return <div className="table-empty"><ShieldCheck size={22} /><span>{emptyMessage}</span></div>;
  }
  return (
    <div className="table-scroll">
      <table className="anomaly-table prediction-table">
        <thead><tr><th>Record ID</th><th>Model Result</th><th>Training Label</th><th>Prediction Code</th></tr></thead>
        <tbody>
          {results.map((item, index) => (
            <tr key={`${item.recordId}-${index}`}>
              <td data-label="Record ID" className="record-id-cell">{item.recordId}</td>
              <td data-label="Model Result"><span className={`prediction-badge ${item.prediction === 1 ? 'anomaly' : 'normal'}`}><i />{item.label}</span></td>
              <td data-label="Training Label" className="category-cell">{item.trainingLabel}</td>
              <td data-label="Prediction Code" className="prediction-code">{item.prediction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UploadPage({
  settings,
  onResult,
  onNavigate,
}: {
  settings: ApiSettings;
  onResult: (data: DashboardData) => void;
  onNavigate: (view: ViewId) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [result, setResult] = useState<DashboardData | null>(null);
  const sizeLimitMb = Math.min(settings.maxFileSizeMb, MAX_FILE_SIZE_MB);
  const maxBytes = sizeLimitMb * 1024 * 1024;

  const acceptFile = (candidate?: File) => {
    if (!candidate) return;
    setError('');
    setSuccess('');
    setResult(null);
    if (!candidate.name.toLowerCase().endsWith('.csv')) {
      setFile(null);
      setError('Only .csv files can be submitted to the trained Random Forest model.');
      return;
    }
    if (candidate.size > maxBytes) {
      setFile(null);
      setError(`File exceeds the ${formatNumber(sizeLimitMb)} MiB upload limit.`);
      return;
    }
    setFile(candidate);
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => acceptFile(event.target.files?.[0]);
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  };

  const analyze = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    setResult(null);
    try {
      const data = await uploadLogFile(file, settings);
      setSuccess(`The Random Forest processed ${formatNumber(data.metrics.totalRecords)} rows and returned ${formatNumber(data.metrics.anomalyCount)} class 1 / Fail predictions.`);
      setResult(data);
      onResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The API request failed. Check the server settings and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="welcome-row">
        <div><div className="eyebrow"><span className="live-dot" /> REAL MODEL ANALYSIS</div><h1>Upload a CSV</h1><p className="page-lede">Send a feature CSV to the supplied Random Forest model and review its actual output.</p></div>
        <span className="mode-pill connected"><Server size={14} /> FastAPI · field `file`</span>
      </section>
      <div className="upload-layout">
        <section className="panel upload-panel">
          <div className="panel-heading">
            <div><div className="panel-title">New Model Analysis</div><div className="panel-subtitle">Select a CSV from your device or drag it into the area below.</div></div>
            <span className="step-chip">Random Forest</span>
          </div>
          <div
            className={`dropzone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={(event) => { if (!(event.target as HTMLElement).closest('button,input,label')) inputRef.current?.click(); }}
          >
            {file ? (
              <>
                <div className="drop-icon file-ready"><FileCheck2 size={27} /></div>
                <strong className="drop-title">{file.name}</strong>
                <span className="drop-caption">{formatNumber(Math.max(1, Math.round(file.size / 1024)))} KB — ready to analyze</span>
                <button type="button" className="remove-file" onClick={(event) => { event.stopPropagation(); setFile(null); setResult(null); if (inputRef.current) inputRef.current.value = ''; }} aria-label="Remove CSV"><X size={15} /></button>
              </>
            ) : (
              <>
                <div className="drop-icon"><CloudUpload size={28} /></div>
                <strong className="drop-title">Drag and drop your CSV here</strong>
                <span className="drop-caption">Or <label className="browse-link browse-file-label">Browse files<input ref={inputRef} className="browse-file-input" type="file" accept=".csv,text/csv" aria-label="Choose a CSV file" onChange={onInputChange} /></label> from your device</span>
                <span className="drop-hint">CSV ONLY <i /> 31 REQUIRED FEATURES <i /> UP TO {formatNumber(sizeLimitMb)} MIB</span>
              </>
            )}
          </div>
          {error && (
            <div className="form-alert error" role="alert">
              <AlertTriangle size={17} /><span>{error}</span>
              {file && <button type="button" className="retry-upload" onClick={() => void analyze()}>Try again</button>}
              <button type="button" onClick={() => setError('')} aria-label="Close error"><X size={15} /></button>
            </div>
          )}
          {success && <div className="form-alert success" role="status"><CheckCircle2 size={17} /><span>{success}</span></div>}
          {busy && (
            <div className="upload-progress">
              <div className="progress-label"><span><LoaderCircle size={16} className="spin" /> Sending CSV to FastAPI and running inference…</span><span className="progress-indeterminate">Waiting for the model response</span></div>
              <div className="progress-track"><i /></div>
            </div>
          )}
          <div className="upload-footer">
            <span><LockKeyhole size={14} /> CSV is processed in memory; the API does not save uploaded files.</span>
            <button className="button button-primary" onClick={() => void analyze()} disabled={!file || busy} type="button">
              {busy ? <LoaderCircle className="spin" size={17} /> : <Activity size={17} />}
              {busy ? 'Analyzing…' : 'Run Random Forest'} <ArrowRight size={15} />
            </button>
          </div>
        </section>
        <aside className="panel upload-help">
          <div className="help-icon"><Shield size={20} /></div>
          <h2>CSV Requirements</h2>
          <p>The server checks the feature schema and sends only validated numeric columns to the trained model.</p>
          <div className="help-divider" />
          <div className="help-fact"><span><FileText size={16} /> Accepted file</span><strong>.CSV ONLY</strong></div>
          <div className="help-fact"><span><Database size={16} /> Model features</span><strong>E1–E29 · Type_y · Latency</strong></div>
          <div className="help-fact"><span><Server size={16} /> API route</span><strong>POST /api/v1/analyze</strong></div>
          <div className="help-fact"><span><LockKeyhole size={16} /> Maximum size</span><strong>{formatNumber(sizeLimitMb)} MiB</strong></div>
          <button className="help-link" onClick={() => onNavigate('settings')} type="button">Connection Settings <ArrowRight size={14} /></button>
        </aside>
      </div>
      {result && (
        <section className="panel result-panel">
          <div className="panel-heading">
            <div><div className="panel-title">Analysis Summary</div><div className="panel-subtitle">{result.fileName || file?.name} · {formatDate(result.analyzedAt)}</div></div>
            <span className="result-chip"><Check size={14} /> Model response received</span>
          </div>
          <div className="result-metrics">
            <div><span>Total rows</span><strong>{formatNumber(result.metrics.totalRecords)}</strong></div>
            <div><span>Normal · Success (0)</span><strong>{formatNumber(result.metrics.normalCount)}</strong></div>
            <div><span>Anomaly · Fail (1)</span><strong>{formatNumber(result.metrics.anomalyCount)}</strong></div>
          </div>
          <div className="result-table-heading"><strong>Actual anomaly predictions</strong><button className="text-button" onClick={() => onNavigate('events')} type="button">Open prediction log <ArrowRight size={14} /></button></div>
          <PredictionTable results={result.results.filter((item) => item.prediction === 1).slice(0, 5)} emptyMessage="The model returned no class 1 / Fail rows for this CSV." />
        </section>
      )}
    </div>
  );
}

function EventsPage({ data }: { data: DashboardData }) {
  const [filter, setFilter] = useState<ResultFilter>('all');
  const visible = useMemo(() => {
    if (filter === 'all') return data.results;
    return data.results.filter((item) => (filter === 'anomaly' ? item.prediction === 1 : item.prediction === 0));
  }, [data.results, filter]);

  return (
    <div className="page-stack">
      <section className="welcome-row">
        <div><div className="eyebrow"><span className="live-dot" /> MODEL OUTPUT REVIEW</div><h1>Prediction Log</h1><p className="page-lede">Review each row returned by the Random Forest; filters use the real class label.</p></div>
        <span className="count-chip"><ShieldAlert size={15} /> {formatNumber(visible.length)} displayed</span>
      </section>
      <section className="panel anomalies-panel full-events">
        <div className="panel-heading">
          <div>
            <div className="panel-title">CSV Prediction Results</div>
            <div className="panel-subtitle">{data.fileName ? `Results for ${data.fileName}` : data.hasAnalysis ? 'All returned predictions in this browser session' : 'Upload a CSV to populate the log'}</div>
          </div>
          <div className="filter-control"><Filter size={15} /><select value={filter} onChange={(event) => setFilter(event.target.value as ResultFilter)} aria-label="Filter model predictions">
            <option value="all">All predictions</option><option value="normal">Normal · Success (0)</option><option value="anomaly">Anomaly · Fail (1)</option>
          </select></div>
        </div>
        <PredictionTable results={visible} emptyMessage={data.hasAnalysis ? 'No rows match this filter.' : 'No predictions yet. Upload a CSV to run the trained model.'} />
      </section>
      <div className="footnote"><CircleHelp size={15} /> This screen shows only predictions returned by the live FastAPI endpoint; it does not generate or substitute results.</div>
    </div>
  );
}

function SettingsPage({ settings, onSave }: { settings: ApiSettings; onSave: (next: ApiSettings) => void }) {
  const [draft, setDraft] = useState<ApiSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ message: string; ok: boolean } | null>(null);
  useEffect(() => { setDraft(settings); }, [settings]);

  const update = <K extends keyof ApiSettings>(key: K, value: ApiSettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setTestResult(null);
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    onSave({
      ...draft,
      baseUrl: draft.baseUrl.trim(),
      analyzePath: draft.analyzePath.trim() || DEFAULT_SETTINGS.analyzePath,
      dashboardPath: draft.dashboardPath.trim() || DEFAULT_SETTINGS.dashboardPath,
      healthPath: draft.healthPath.trim() || DEFAULT_SETTINGS.healthPath,
      fileField: 'file',
      maxFileSizeMb: Math.max(1, Math.min(MAX_FILE_SIZE_MB, Number(draft.maxFileSizeMb) || MAX_FILE_SIZE_MB)),
    });
    setSaved(true);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const model: ModelMetadata = await fetchHealth(draft);
      setTestResult({ message: `Connected to ${model.name} · scikit-learn ${model.sklearnVersion} · ${model.featureCount} features.`, ok: true });
    } catch (cause) {
      setTestResult({ message: cause instanceof Error ? cause.message : 'FastAPI health check failed.', ok: false });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="welcome-row">
        <div><div className="eyebrow"><span className="live-dot" /> SYSTEM SETTINGS</div><h1>Connection Settings</h1><p className="page-lede">Configure the live FastAPI endpoints used by CSV upload and the Dashboard.</p></div>
        <span className="secure-label"><LockKeyhole size={15} /> Browser-safe settings only</span>
      </section>
      <form className="settings-layout" onSubmit={save}>
        <section className="panel settings-main">
          <div className="panel-heading"><div><div className="panel-title">Live FastAPI Connection</div><div className="panel-subtitle">The frontend never switches to generated sample predictions.</div></div><SlidersHorizontal size={19} className="muted-icon" /></div>
          <div className="mode-options">
            <div className="mode-option selected" aria-label="Live FastAPI mode is always enabled">
              <span className="mode-option-icon api"><Server size={19} /></span>
              <span><strong>Real Random Forest API</strong><small>CSV uploads are sent to the supplied model endpoint.</small></span>
              <i className="radio-mark" />
            </div>
          </div>
          <div className="api-fields">
            <div className="settings-section-label"><span className="section-number">1</span><div><strong>Server URL and endpoints</strong><small>Defaults match the team's FastAPI service. Leave base URL blank for same-origin or the Vite proxy.</small></div></div>
            <label className="field-label">API base URL<input dir="ltr" value={draft.baseUrl} onChange={(event) => update('baseUrl', event.target.value)} placeholder="Leave blank, or enter http://127.0.0.1:8000" /></label>
            <div className="field-row">
              <label className="field-label">CSV analysis endpoint<input dir="ltr" value={draft.analyzePath} onChange={(event) => update('analyzePath', event.target.value)} placeholder="/api/v1/analyze" /></label>
              <label className="field-label">Dashboard endpoint<input dir="ltr" value={draft.dashboardPath} onChange={(event) => update('dashboardPath', event.target.value)} placeholder="/api/v1/dashboard" /></label>
            </div>
            <div className="field-row">
              <label className="field-label">Health endpoint<input dir="ltr" value={draft.healthPath} onChange={(event) => update('healthPath', event.target.value)} placeholder="/health" /></label>
              <label className="field-label">Maximum CSV size (MiB)<input type="number" min="1" max={MAX_FILE_SIZE_MB} value={draft.maxFileSizeMb} onChange={(event) => update('maxFileSizeMb', Number(event.target.value))} /></label>
            </div>
            <div className="cors-note"><AlertTriangle size={16} /><span>The upload field is fixed to <code>file</code>. For direct cross-origin requests, set explicit trusted CORS origins on FastAPI; do not enter secrets in this browser form.</span></div>
            {testResult && <div className={`form-alert ${testResult.ok ? 'success' : 'error'}`} role={testResult.ok ? 'status' : 'alert'}>{testResult.ok ? <CheckCircle2 size={17} /> : <WifiOff size={17} />}<span>{testResult.message}</span></div>}
          </div>
          <div className="settings-actions">
            {saved && <span className="saved-note"><CheckCircle2 size={16} /> Settings saved in this browser</span>}
            <button className="button button-quiet" type="button" onClick={() => void testConnection()} disabled={testing}>{testing ? <LoaderCircle className="spin" size={16} /> : <Activity size={16} />}{testing ? 'Testing…' : 'Test connection'}</button>
            <button className="button button-primary" type="submit"><Check size={16} /> Save settings</button>
          </div>
        </section>
        <aside className="settings-side">
          <div className="panel contract-card">
            <div className="contract-icon"><FileText size={19} /></div><h2>Verified API Contract</h2><p>Routes and response fields are aligned with the supplied FastAPI model service.</p>
            <div className="endpoint-line"><span>POST</span><code>/api/v1/analyze</code></div>
            <div className="endpoint-line"><span className="get-method">GET</span><code>/api/v1/dashboard</code></div>
            <div className="endpoint-line"><span className="get-method">GET</span><code>/health</code></div>
            <div className="contract-separator" />
            <div className="contract-point"><CheckCircle2 size={15} /> multipart field: <code>file</code></div>
            <div className="contract-point"><CheckCircle2 size={15} /> 15 MiB limit on client and server</div>
            <div className="contract-point"><CheckCircle2 size={15} /> 31 numeric trained features</div>
            <a href="/user-manual.md" className="help-link" target="_blank" rel="noreferrer">Integration &amp; User Guide <ArrowRight size={14} /></a>
          </div>
          <div className="data-safety"><ShieldCheck size={18} /><span><strong>No mock fallback</strong><small>Files are validated and analyzed in memory. If the model or API is unavailable, the request fails clearly.</small></span></div>
        </aside>
      </form>
    </div>
  );
}

function App() {
  const [settings, setSettings] = useState<ApiSettings>(readSettings);
  const [view, setView] = useState<ViewId>(getLocationView);
  const [dashboard, setDashboard] = useState<DashboardData>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dashboardRequestId = useRef(0);

  const refreshDashboard = useCallback(async () => {
    const requestId = ++dashboardRequestId.current;
    setDashboard(EMPTY_DASHBOARD);
    setLoading(true);
    setDashboardError('');
    try {
      const result = await fetchDashboard(settings);
      if (requestId === dashboardRequestId.current) setDashboard(result);
    } catch (cause) {
      if (requestId === dashboardRequestId.current) {
        setDashboard(EMPTY_DASHBOARD);
        setDashboardError(cause instanceof Error ? cause.message : 'Could not load Dashboard data from FastAPI.');
      }
    } finally {
      if (requestId === dashboardRequestId.current) setLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    const syncView = () => setView(getLocationView());
    window.addEventListener('popstate', syncView);
    return () => window.removeEventListener('popstate', syncView);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('cloudshield-api-settings', JSON.stringify(settings)); } catch { /* Browser storage is optional. */ }
  }, [settings]);

  useEffect(() => { void refreshDashboard(); }, [refreshDashboard]);

  const selectedNav = NAV_ITEMS.find((item) => item.id === view);
  const pageTitle = selectedNav?.label ?? 'Overview';
  const navigate = (next: ViewId) => {
    setView(next);
    setMobileMenuOpen(false);
    const params = new URLSearchParams(window.location.search);
    if (next === 'overview') params.delete('view');
    else params.set('view', next);
    const query = params.toString();
    window.history.pushState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveSettings = (next: ApiSettings) => setSettings(next);
  const acceptAnalysis = (data: DashboardData) => {
    dashboardRequestId.current += 1;
    setLoading(false);
    setDashboard(data);
    setDashboardError('');
  };

  const apiConnected = dashboard.model.status === 'ready' && !dashboardError;
  const connectionLabel = loading ? 'Checking FastAPI model' : dashboardError ? 'FastAPI unavailable' : apiConnected ? 'Random Forest ready' : 'Awaiting model status';

  return (
    <div className="app-shell" dir="ltr">
      <header className="command-header">
        <div className="command-mainbar">
          <div className="command-identity">
            <div className="brand-lockup"><div className="brand-mark"><Activity size={21} strokeWidth={2.8} /></div><div><strong>CloudShield</strong><span>Log Anomaly Detection</span></div></div>
            <div className="header-workspace"><div className="workspace-avatar">C</div><span><small>Workspace</small><strong>Security Team</strong></span><ChevronDown size={14} /></div>
          </div>
          <nav className={`main-nav ${mobileMenuOpen ? 'nav-open' : ''}`} id="cloudshield-primary-nav" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} aria-current={view === item.id ? 'page' : undefined} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)} type="button">
                  <Icon size={17} /><span>{item.label}</span>
                  {item.id === 'events' && dashboard.metrics.totalRecords > 0 && <small className="nav-count">{formatNumber(dashboard.metrics.totalRecords)}</small>}
                  {view === item.id && <i className="nav-active-bar" />}
                </button>
              );
            })}
          </nav>
          <div className="command-actions">
            <span className={`mode-pill ${apiConnected ? 'connected' : 'unavailable'}`}><span className={`status-light ${apiConnected ? 'api' : 'offline'}`} />{apiConnected ? 'Live Model' : loading ? 'Connecting' : 'API Offline'}</span>
            <span className="top-date"><Clock3 size={15} /> {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date())}</span>
            <button className="command-settings" onClick={() => navigate('settings')} aria-label="Change API settings" type="button"><Settings2 size={17} /></button>
            <div className="header-profile"><span className="top-avatar" aria-label="Security analyst">C</span><span><strong>CloudShield</strong><small>Security Analyst</small></span></div>
          </div>
          <button className="mobile-menu" onClick={() => setMobileMenuOpen((open) => !open)} aria-expanded={mobileMenuOpen} aria-controls="cloudshield-primary-nav" aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'} type="button"><span /><span /><span /></button>
        </div>
        <div className="command-context">
          <div className="breadcrumb"><span>CloudShield</span><span>/</span><strong>{pageTitle}</strong></div>
          <div className="command-context-note"><span className={`status-light ${apiConnected ? 'api' : 'offline'}`} /><span>{connectionLabel}</span><span className="context-note-divider" /><span>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date())}</span></div>
        </div>
      </header>
      <div className="content-shell">
        <main className="page-content">
          {view === 'overview' && <OverviewPage data={dashboard} loading={loading} error={dashboardError} onRetry={() => void refreshDashboard()} onNavigate={navigate} />}
          {view === 'upload' && <UploadPage settings={settings} onResult={acceptAnalysis} onNavigate={navigate} />}
          {view === 'events' && <EventsPage data={dashboard} />}
          {view === 'settings' && <SettingsPage settings={settings} onSave={saveSettings} />}
        </main>
        <footer className="app-footer"><span><i className="footer-brand-dot" /> CloudShield <b>·</b> Random Forest Log Analysis</span><span>Live model results only <b>·</b> 2026</span></footer>
      </div>
    </div>
  );
}

export default App;
