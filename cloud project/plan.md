# CloudShield Integration Plan

## Source of truth and preservation

The supplied `projectcloud.rar` remains unchanged at `/home/ubuntu/upload/projectcloud.rar`. Its contents were extracted to the separate `/home/ubuntu/cloudshield_source` snapshot. Work is isolated on the `cloudshield-integration` branch in `/home/ubuntu/logscope`; the prior `main` version remains recoverable. Keep the supplied frontend design and screens rather than creating a replacement.

## Verified model and API architecture

- Frontend: React 18, TypeScript, Vite. Use the existing CloudShield/LogScope Operations Overview, CSV upload, prediction log, and settings screens.
- Backend: FastAPI in root `main.py`; load only the supplied root `rf_model.pkl`. On startup validate estimator type, scikit-learn version, ordered feature names/count, and classes. Missing or incompatible artifacts fail closed; no substitute/mock predictions.
- Model contract from notebook and artifact: RandomForestClassifier, 100 estimators, scikit-learn `1.6.1`, 31 ordered inputs `E1`–`E29`, `Type_y`, `Latency`; fill missing feature values with zero and do not scale; classes `0=Success` and `1=Fail`. The UI maps these honestly to `Normal` and `Anomaly` while retaining the training label and integer prediction.
- `POST /api/v1/analyze` receives `.csv` as multipart `file`; the client and server cap it at 15 MiB. The Backend reorders exactly the trained columns, rejects missing columns, duplicate headers, invalid nonnumeric values and invalid predictions, uses `BlockId` as the row ID when present, and returns actual results and class totals only.
- `GET /api/v1/dashboard` truthfully returns an empty, model-ready state; there is no fabricated history or server persistence. Results remain visible during the current SPA session and reset after a full reload. `GET /health` reports readiness/model metadata.
- Local development uses Vite's same-origin proxy for `/api/*` and `/health` to `http://127.0.0.1:8000`. Production uses relative same-origin URLs, with FastAPI serving `dist/` from the same container. CORS permits explicit configured local origins; wildcard CORS is rejected.

## Project structure

- `src/App.tsx`: retained Operations Overview, upload, prediction log, and connection settings screens, adapted to actual model fields.
- `src/lib/api.ts`, `src/types.ts`: strict `/health`, dashboard and upload clients; schema validation for actual model metadata/results.
- `main.py`, `rf_model.pkl`: FastAPI application and exact preserved trained artifact.
- `requirements.txt`: pinned Python 3.12 runtime dependencies; `requirements-dev.txt` contains tests.
- `ml/training/task.ipynb`, `ml/training/hdfs_sample_unified.csv`: preserved training provenance and supplied CSV; not copied into the production image.
- `tests/test_api.py`: actual-model, request-validation, CORS and failure-path tests.
- `Dockerfile`: Node 22/pnpm frontend build stage and Python 3.12/FastAPI runtime stage.
- `docs/`, `public/user-manual.md`, `public/screenshots/`: integration prompt, user/API guide and verified inference screenshots.

## Verified runtime and deployment decision

The exact artifact loads under Python 3.12 with the pinned packages; its process peak RSS in the isolated verification run was 161,872 KiB. Direct model inference and the Vite-proxied API produced 2,000 rows: 1,953 class-0/Success and 47 class-1/Fail. Nine API tests passed. The integrated React upload and Dashboard were exercised with the supplied CSV.

The bound WebDev host supports Dockerfile-based server deployments, and its default ceiling is 1 vCPU / 512 MiB; the measured model process is below that ceiling, so the workload is technically suitable for an on-demand container. The image serves frontend and backend on one origin, health path `/health`, one worker, and no managed database. Do not enable always-on hosting or add persistence by default.

**Access boundary:** no authentication is currently implemented. A published URL exposes an unauthenticated CSV inference endpoint, limited to 15 MiB per request; uploads and results are not durably stored. Do not submit sensitive or production logs. The user explicitly requested deployment if the real model is supported; publish only after the exact committed Docker image and live upload are verified, and clearly disclose the public-access limitation.
