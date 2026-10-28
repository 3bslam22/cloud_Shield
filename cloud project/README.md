# CloudShield — Log Anomaly Detection

CloudShield preserves the supplied React/TypeScript frontend and runs the team's actual FastAPI Random Forest model. It does not generate demo or placeholder predictions.

## Verified model contract

- Artifact: root `rf_model.pkl` (the supplied file is preserved, not retrained).
- Estimator/runtime: `RandomForestClassifier`, scikit-learn `1.6.1`, Python `3.12`.
- Ordered numeric input features: `E1`–`E29`, `Type_y`, `Latency` (31 columns).
- Preprocessing: feature order is aligned to the training notebook; missing model values become `0`; no scaling is applied because the shown training cell fits raw `X`.
- Classes: `0 = Success` (shown as Normal) and `1 = Fail` (shown as Anomaly).

## Local run

Use Python 3.12, Node.js 22, and pnpm 11.25.0. In the project root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```bash
pnpm install
pnpm dev
```

Vite serves the UI on port `3000` and proxies `/api/*` and `/health` to FastAPI at `http://127.0.0.1:8000`. The production browser bundle uses relative same-origin paths. Copy `.env.example` to `.env.local` only if you need to override browser-safe defaults; never put secrets in Vite variables.

## API

- `GET /health` — readiness and loaded-model metadata.
- `GET /api/v1/dashboard` — model-ready empty state; no server-side history is stored.
- `POST /api/v1/analyze` — CSV upload, multipart field `file`, `.csv` only, maximum `15 MiB`.

A full local sample upload is:

```bash
curl -F 'file=@ml/training/hdfs_sample_unified.csv' http://127.0.0.1:8000/api/v1/analyze
```

The API returns actual per-row `record_id`, integer `prediction`, UI `label`, and training `training_label`, along with totals. It does not invent confidence, severity, risk scores, or timestamps. `BlockId` is used for `record_id` when present; otherwise the row index is used.

## Checks

```bash
pnpm build
.venv/bin/python -m pytest -q tests/test_api.py
```

The integration test compares the API output with direct predictions from the same supplied model on the same CSV. The expected result for the supplied 2,000-row sample is 1,953 class-0/Success and 47 class-1/Fail; this is an inference result, **not an accuracy measurement**.

## Container and deployment

`Dockerfile` builds the existing Vite UI in a Node 22/pnpm stage and serves its `dist/` from the Python 3.12/FastAPI runtime. The container honors `PORT` (defaults to `3000`), runs one Uvicorn worker, and exposes `/health`. It does not include the notebook or dataset in the runtime image.

The WebDev hosting platform supports Dockerfile-based Python containers. Current deployment configuration and actual publication status are recorded separately; a Dockerfile or successful Preview is not proof of a live deployment.

## Data/security note

Uploads are validated and processed for inference but are not stored as application history. The model and service do not require a database. There is no login/API authentication in this university demo; if published publicly, anyone with the URL can submit CSVs up to 15 MiB. Do not upload production logs, credentials, or other sensitive records. CORS is restricted to explicit origins and is not a substitute for authentication.

See the [User and API Integration Guide](docs/user-manual.md) and [Corrected Integration Prompt](docs/CLOUDSHIELD_INTEGRATION_PROMPT.md).
