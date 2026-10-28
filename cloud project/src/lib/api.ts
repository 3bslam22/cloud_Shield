import type {
  ApiSettings,
  DashboardData,
  ModelMetadata,
  PredictionLabel,
  PredictionResult,
  TrainingLabel,
} from '../types';

const env = import.meta.env;
export const MAX_FILE_SIZE_MB = 15;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const DEFAULT_SETTINGS: ApiSettings = {
  baseUrl: env.VITE_API_BASE_URL?.trim() ?? '',
  analyzePath: env.VITE_ANALYZE_ENDPOINT?.trim() || '/api/v1/analyze',
  dashboardPath: env.VITE_DASHBOARD_ENDPOINT?.trim() || '/api/v1/dashboard',
  healthPath: env.VITE_HEALTH_ENDPOINT?.trim() || '/health',
  fileField: 'file',
  maxFileSizeMb: MAX_FILE_SIZE_MB,
};

const EXPECTED_MODEL_NAME = 'RandomForestClassifier';
const EXPECTED_SKLEARN_VERSION = '1.6.1';
const EXPECTED_FEATURE_COUNT = 31;

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`The ${label} in the API response must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`The ${label} field is missing or invalid in the API response.`);
  }
  return value.trim();
}

function integer(value: unknown, label: string, minimum = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`The ${label} field must be a non-negative integer.`);
  }
  return parsed;
}

function normalizeModel(source: Record<string, unknown>): ModelMetadata {
  const mapping = asObject(source.class_mapping, 'class_mapping');
  const name = text(source.model_name, 'model_name');
  const version = text(source.sklearn_version, 'sklearn_version');
  const featureCount = integer(source.feature_count, 'feature_count');
  const status = text(source.model_status, 'model_status');
  if (name !== EXPECTED_MODEL_NAME) throw new Error(`Unexpected model returned by the server: ${name}.`);
  if (version !== EXPECTED_SKLEARN_VERSION) throw new Error(`The server reports scikit-learn ${version}; this model contract requires ${EXPECTED_SKLEARN_VERSION}.`);
  if (featureCount !== EXPECTED_FEATURE_COUNT) throw new Error(`The server reports ${featureCount} model features; ${EXPECTED_FEATURE_COUNT} are required.`);
  if (status !== 'ready') throw new Error('The Random Forest model is not ready on the server.');
  if (mapping['0'] !== 'Success' || mapping['1'] !== 'Fail') {
    throw new Error('The server class mapping does not match the training code (0=Success, 1=Fail).');
  }
  return {
    status: 'ready',
    name,
    featureCount,
    sklearnVersion: version,
    classMapping: { normal: 'Success', anomaly: 'Fail' },
  };
}

function normalizePrediction(value: unknown, index: number): PredictionResult {
  const item = asObject(value, `results[${index}]`);
  const recordId = text(item.record_id, `results[${index}].record_id`);
  const prediction = integer(item.prediction, `results[${index}].prediction`);
  if (prediction !== 0 && prediction !== 1) {
    throw new Error(`The prediction for record ${recordId} must be class 0 or 1.`);
  }
  const expectedLabel: PredictionLabel = prediction === 0 ? 'Normal' : 'Anomaly';
  const expectedTrainingLabel: TrainingLabel = prediction === 0 ? 'Success' : 'Fail';
  const label = text(item.label, `results[${index}].label`);
  const trainingLabel = text(item.training_label, `results[${index}].training_label`);
  if (label !== expectedLabel || trainingLabel !== expectedTrainingLabel) {
    throw new Error(`The labels returned for record ${recordId} do not match prediction class ${prediction}.`);
  }
  return { recordId, prediction, label, trainingLabel };
}

export function normalizeDashboard(payload: unknown, requestedFileName?: string): DashboardData {
  const root = asObject(payload, 'response');
  if (root.status !== 'success') throw new Error('The API response status must be "success".');
  const model = normalizeModel(root);
  if (!Array.isArray(root.results)) throw new Error('The API response must include a results array.');
  const results = root.results.map(normalizePrediction);
  const totalRecords = integer(root.total_records, 'total_records');
  const normalCount = integer(root.normal_count, 'normal_count');
  const anomalyCount = integer(root.anomaly_count, 'anomaly_count');
  const hasAnalysis = root.has_analysis === true;

  if (totalRecords !== results.length) throw new Error('The API result count does not match total_records.');
  if (normalCount + anomalyCount !== totalRecords) throw new Error('The API label counts do not add up to total_records.');
  const actualNormalCount = results.filter((item) => item.prediction === 0).length;
  const actualAnomalyCount = results.length - actualNormalCount;
  if (normalCount !== actualNormalCount || anomalyCount !== actualAnomalyCount) {
    throw new Error('The API summary counts do not match the returned model predictions.');
  }
  if (!hasAnalysis && totalRecords !== 0) throw new Error('An empty dashboard response cannot contain analysis counts.');
  if (hasAnalysis && totalRecords === 0) throw new Error('An analysis response must include at least one CSV row.');

  const fileName = typeof root.file_name === 'string' ? root.file_name : requestedFileName;
  const analyzedAt = typeof root.analyzed_at === 'string' ? root.analyzed_at : undefined;
  return {
    metrics: { totalRecords, normalCount, anomalyCount },
    results,
    model,
    hasAnalysis,
    ...(fileName ? { fileName } : {}),
    ...(analyzedAt ? { analyzedAt } : {}),
  };
}

export function joinApiUrl(baseUrl: string, path: string): string {
  const route = path.trim();
  if (/^https?:\/\//i.test(route)) return route;
  const base = baseUrl.trim().replace(/\/+$/, '');
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  return `${base}${normalizedRoute}`;
}

async function request(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 60_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal, credentials: 'omit' });
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') {
      throw new Error('The request timed out after 60 seconds. Check the API service and try again.');
    }
    throw new Error('Could not reach FastAPI. Check the API URL, development proxy, network, and CORS settings.');
  } finally {
    window.clearTimeout(timer);
  }
}

async function readJson(response: Response): Promise<unknown> {
  const responseText = await response.text();
  let body: unknown;
  try {
    body = responseText ? JSON.parse(responseText) : {};
  } catch {
    body = { detail: responseText.slice(0, 500) };
  }
  if (!response.ok) {
    const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const detail = record.detail ?? record.message ?? record.error;
    const message = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : `HTTP ${response.status}`;
    throw new Error(`FastAPI request failed (${response.status}): ${message}`);
  }
  return body;
}

export async function uploadLogFile(file: File, settings: ApiSettings): Promise<DashboardData> {
  if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Only .csv files can be sent to the model.');
  if (file.size > Math.min(settings.maxFileSizeMb, MAX_FILE_SIZE_MB) * 1024 * 1024) {
    throw new Error(`File exceeds the ${Math.min(settings.maxFileSizeMb, MAX_FILE_SIZE_MB)} MiB upload limit.`);
  }
  const form = new FormData();
  form.append('file', file, file.name);
  const response = await request(joinApiUrl(settings.baseUrl, settings.analyzePath), {
    method: 'POST',
    body: form,
    headers: { Accept: 'application/json' },
  });
  return normalizeDashboard(await readJson(response), file.name);
}

export async function fetchDashboard(settings: ApiSettings): Promise<DashboardData> {
  const response = await request(joinApiUrl(settings.baseUrl, settings.dashboardPath), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  return normalizeDashboard(await readJson(response));
}

export async function fetchHealth(settings: ApiSettings): Promise<ModelMetadata> {
  const response = await request(joinApiUrl(settings.baseUrl, settings.healthPath), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const root = asObject(await readJson(response), 'health response');
  return normalizeModel(root);
}
