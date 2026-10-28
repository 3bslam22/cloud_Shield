# CloudShield — Accurate Integration Prompt

You are integrating the attached, existing CloudShield/LogScope project. **Do not rebuild it from scratch.** Treat the uploaded archive as the source of truth, preserve a clean copy of all original files, and retain the existing React UI and features wherever possible. Work on a separate branch or copy; do not overwrite the original archive.

## Inventory before changes

Inspect the complete archive and identify the frontend framework and source files, FastAPI entry point, API routes, trained model, training notebook, dataset schema, and dependency manifests. The current archive contains a React 18 + TypeScript + Vite frontend, FastAPI `main.py`, `rf_model.pkl`, `task.ipynb`, and `hdfs_sample_unified.csv`. The frontend visual reference is the supplied Operations Overview with horizontal command navigation; preserve it.

## Verified model and request contract

- The API analysis route is `POST /api/v1/analyze`.
- Upload the CSV as `multipart/form-data` using the exact field name `file`.
- Accept only `.csv` files; enforce the server-side maximum of **15 MiB** while reading the request, and apply the same limit in the frontend.
- The required ordered model columns are exactly `E1` through `E29`, then `Type_y`, then `Latency` (31 features). Ignore unrelated CSV columns after validation.
- The supplied training notebook maps `Success` to class `0` and `Fail` to class `1`. It fills missing values with zero. Although it calculates a `StandardScaler` output, the shown final training code fits the Random Forest using raw, unscaled `X`; do not add scaling unless the loaded estimator or additional supplied training code proves it is required.
- Static pickle metadata identifies `sklearn.ensemble.RandomForestClassifier` and scikit-learn version `1.6.1`. Verify that `rf_model.pkl` loads with the selected Python/runtime dependencies and that its `feature_names_in_`, feature count, and classes agree with the supplied training code before serving predictions. Preserve the artifact bytes; do not retrain or replace it.
- `BlockId` is optional and is not a model feature; use it as `record_id` when present, otherwise use the row number.

## Required implementation

1. Make model initialization fail closed. If `rf_model.pkl` is missing, incompatible, or has unexpected classes/features, do not start model-serving routes and never generate patterned, random, demo, or placeholder predictions.
2. Match the frontend to the real FastAPI route and multipart field. Use one consistent base URL; prefer a Vite `/api` proxy for local development and relative same-origin API paths in production.
3. Adapt the actual Backend response—`total_records`, `normal_count`, `anomaly_count`, and per-row `record_id`, `prediction`, `label`—to the existing UI. Do not fabricate severity, confidence, timestamp, risk score, or time-series data that the model does not return. Present actual binary model labels (`Success`/`Fail`, class `0`/`1`) honestly.
4. Resolve the existing missing dashboard route without mock data. A dashboard endpoint may return a truthful empty state before an upload; the current upload response should populate the UI. Do not claim durable history unless persistent storage is implemented and authorized.
5. Use explicit CORS origins rather than wildcard CORS. Keep security headers compatible with embedded Preview; do not send `X-Frame-Options: DENY` or `SAMEORIGIN`. Avoid storing uploaded CSVs or returning raw feature data unnecessarily.
6. Add a Python dependency manifest pinned to versions actually tested with this pickle. Keep training-only dependencies separate from runtime dependencies. Supply a Dockerfile only if the selected host can build and run both the Python model API and compiled frontend within available resources.
7. Configure and test the health route, CSV validation, missing-column errors, upload-size rejection, model startup failure, frontend upload, and display of the actual model predictions. Compare API predictions against a direct call to the same loaded model on the same feature rows. Report measured results; do not claim unrun tests.
8. Deploy only if the hosting platform actually supports the Python runtime, pinned dependencies, artifact, memory requirements, and access-control requirements. Verify the live frontend-to-Backend upload before reporting a live URL. If deployment is unsupported or unsafe, do not publish; report the exact blocker and the smallest required change.

## Final response

Provide the changed project files, exact endpoints/request format, confirmed model feature/class contract, dependency versions, tests that actually passed, deployment status, and a live URL only if deployment and a real frontend-to-Backend inference were verified. Clearly state any unresolved blocker. Do not claim the model is accurate based solely on a notebook output; distinguish reported training metrics from an independently rerun evaluation.
