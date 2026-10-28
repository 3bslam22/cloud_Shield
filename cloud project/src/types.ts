export type PredictionValue = 0 | 1;
export type PredictionLabel = 'Normal' | 'Anomaly';
export type TrainingLabel = 'Success' | 'Fail';

export interface PredictionResult {
  recordId: string;
  prediction: PredictionValue;
  label: PredictionLabel;
  trainingLabel: TrainingLabel;
}

export interface DashboardMetrics {
  totalRecords: number;
  normalCount: number;
  anomalyCount: number;
}

export interface ModelMetadata {
  status: 'ready' | 'unknown';
  name: string;
  featureCount: number;
  sklearnVersion: string;
  classMapping: {
    normal: 'Success';
    anomaly: 'Fail';
  };
}

export interface DashboardData {
  metrics: DashboardMetrics;
  results: PredictionResult[];
  model: ModelMetadata;
  hasAnalysis: boolean;
  fileName?: string;
  analyzedAt?: string;
}

export interface ApiSettings {
  baseUrl: string;
  analyzePath: string;
  dashboardPath: string;
  healthPath: string;
  fileField: 'file';
  maxFileSizeMb: number;
}
