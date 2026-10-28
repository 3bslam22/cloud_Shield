/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ANALYZE_ENDPOINT?: string;
  readonly VITE_DASHBOARD_ENDPOINT?: string;
  readonly VITE_HEALTH_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
