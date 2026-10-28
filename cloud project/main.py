from __future__ import annotations

import io
import logging
import os
import warnings
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sklearn import __version__ as SKLEARN_VERSION
from sklearn.ensemble import RandomForestClassifier
from sklearn.exceptions import InconsistentVersionWarning
from starlette.staticfiles import StaticFiles

logger = logging.getLogger("cloudshield")

EXPECTED_FEATURES: tuple[str, ...] = tuple(
    [f"E{index}" for index in range(1, 30)] + ["Type_y", "Latency"]
)
EXPECTED_CLASS_MAPPING = {"0": "Success", "1": "Fail"}
EXPECTED_SKLEARN_VERSION = "1.6.1"
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
MODEL_PATH = Path(
    os.getenv("MODEL_PATH", str(Path(__file__).resolve().with_name("rf_model.pkl")))
).resolve()
DIST_PATH = Path(__file__).resolve().with_name("dist")


def load_model(path: Path = MODEL_PATH) -> RandomForestClassifier:
    """Load and validate the supplied artifact; never continue with a substitute."""
    if SKLEARN_VERSION != EXPECTED_SKLEARN_VERSION:
        raise RuntimeError(
            f"scikit-learn {EXPECTED_SKLEARN_VERSION} is required for rf_model.pkl; "
            f"runtime has {SKLEARN_VERSION}."
        )
    if not path.is_file():
        raise RuntimeError(f"Required model artifact is missing: {path}")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", InconsistentVersionWarning)
            model: Any = joblib.load(path)
    except Exception as exc:
        raise RuntimeError(f"Could not load the supplied Random Forest artifact: {exc}") from exc

    if not isinstance(model, RandomForestClassifier):
        raise RuntimeError(f"Expected RandomForestClassifier, got {type(model).__name__}.")
    if int(getattr(model, "n_features_in_", -1)) != len(EXPECTED_FEATURES):
        raise RuntimeError(f"The model must have exactly {len(EXPECTED_FEATURES)} input features.")
    feature_names = getattr(model, "feature_names_in_", None)
    if feature_names is None or tuple(str(name) for name in feature_names) != EXPECTED_FEATURES:
        raise RuntimeError("The model feature names/order do not match the supplied training schema.")
    classes = tuple(int(label) for label in getattr(model, "classes_", ()))
    if classes != (0, 1):
        raise RuntimeError(f"Expected model classes (0, 1), got {classes}.")
    return model


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.model = load_model()
    yield
    app.state.model = None


app = FastAPI(
    title="CloudShield Log Analysis API",
    version="1.1.0",
    description="CSV anomaly classification using the supplied Random Forest model.",
    lifespan=lifespan,
)

_origins = [
    item.strip()
    for item in os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if item.strip()
]
if "*" in _origins:
    raise RuntimeError("CORS_ORIGINS must list explicit trusted origins; wildcard origins are disabled.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Accept", "Content-Type"],
    max_age=600,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.url.path.startswith("/api/") or request.url.path == "/health":
        response.headers["Cache-Control"] = "no-store"
    # Do not set X-Frame-Options: managed Preview is embedded in a cross-site iframe.
    return response


def model_metadata(model: RandomForestClassifier) -> dict[str, Any]:
    return {
        "model_status": "ready",
        "model_name": "RandomForestClassifier",
        "sklearn_version": SKLEARN_VERSION,
        "feature_count": len(EXPECTED_FEATURES),
        "class_mapping": EXPECTED_CLASS_MAPPING,
    }


def empty_dashboard(model: RandomForestClassifier) -> dict[str, Any]:
    return {
        "status": "success",
        "has_analysis": False,
        "total_records": 0,
        "normal_count": 0,
        "anomaly_count": 0,
        "results": [],
        "file_name": None,
        "analyzed_at": None,
        **model_metadata(model),
    }


def _record_id(value: Any, row_index: int) -> str:
    if value is None or pd.isna(value) or not str(value).strip():
        return f"row_{row_index + 1}"
    if isinstance(value, (int, np.integer)):
        return str(int(value))
    if isinstance(value, (float, np.floating)) and np.isfinite(value) and float(value).is_integer():
        return str(int(value))
    cleaned = " ".join(str(value).split())
    return cleaned[:200] or f"row_{row_index + 1}"


def _model_input(frame: pd.DataFrame) -> pd.DataFrame:
    if not frame.columns.is_unique:
        raise HTTPException(status_code=422, detail="The CSV contains duplicate column names.")
    missing = [feature for feature in EXPECTED_FEATURES if feature not in frame.columns]
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"CSV is missing required model feature columns: {', '.join(missing)}",
        )
    if frame.empty:
        raise HTTPException(status_code=422, detail="The CSV contains a header but no data rows.")

    converted = pd.DataFrame(index=frame.index)
    invalid_columns: list[str] = []
    for feature in EXPECTED_FEATURES:
        raw = frame[feature]
        numeric = pd.to_numeric(raw, errors="coerce")
        nonblank = raw.notna() & raw.astype("string").str.strip().ne("")
        if bool((nonblank & numeric.isna()).any()):
            invalid_columns.append(feature)
        converted[feature] = numeric
    if invalid_columns:
        raise HTTPException(
            status_code=422,
            detail=f"Model feature columns must contain numeric values: {', '.join(invalid_columns)}",
        )

    # Matches the supplied notebook: preserve feature order and fill missing values with zero.
    converted = converted.loc[:, list(EXPECTED_FEATURES)].fillna(0)
    if not np.isfinite(converted.to_numpy(dtype=np.float64, copy=False)).all():
        raise HTTPException(status_code=422, detail="Model feature values must be finite numbers.")
    return converted


def _uploaded_file_name(name: str | None) -> str:
    candidate = (name or "upload.csv").replace("\\", "/").split("/")[-1].strip()
    return candidate[:200] or "upload.csv"


@app.get("/health", tags=["Health"])
def health_check(request: Request) -> dict[str, Any]:
    model: RandomForestClassifier | None = getattr(request.app.state, "model", None)
    if model is None:
        raise HTTPException(status_code=503, detail="The Random Forest model is not loaded.")
    return {"status": "success", **model_metadata(model)}


@app.get("/api/v1/dashboard", tags=["Dashboard"])
def dashboard(request: Request) -> dict[str, Any]:
    model: RandomForestClassifier | None = getattr(request.app.state, "model", None)
    if model is None:
        raise HTTPException(status_code=503, detail="The Random Forest model is not loaded.")
    # Analysis is session-only; this endpoint never implies saved history or fabricated rows.
    return empty_dashboard(model)


@app.post("/api/v1/analyze", tags=["Analysis"])
async def analyze_logs(
    request: Request,
    file: Annotated[UploadFile, File(description="CSV with the 31 trained model features")],
) -> dict[str, Any]:
    model: RandomForestClassifier | None = getattr(request.app.state, "model", None)
    if model is None:
        raise HTTPException(status_code=503, detail="The Random Forest model is not loaded.")
    basename = (file.filename or "").replace("\\", "/").split("/")[-1]
    if not basename or Path(basename).suffix.lower() != ".csv":
        raise HTTPException(status_code=400, detail="Only .csv files are accepted.")

    try:
        contents = await file.read(MAX_UPLOAD_BYTES + 1)
    except Exception as exc:
        logger.warning("Upload read failed: %s", type(exc).__name__)
        raise HTTPException(status_code=400, detail="Could not read the uploaded CSV file.") from exc
    finally:
        await file.close()

    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="CSV file exceeds the 15 MiB upload limit.")
    if not contents.strip():
        raise HTTPException(status_code=400, detail="The uploaded CSV file is empty.")

    try:
        frame = pd.read_csv(io.BytesIO(contents))
    except Exception as exc:
        logger.info("CSV parse rejected: %s", type(exc).__name__)
        raise HTTPException(status_code=400, detail="The uploaded file is not a readable CSV.") from exc

    model_frame = _model_input(frame)
    try:
        predictions = model.predict(model_frame)
    except Exception as exc:
        logger.exception("Random Forest inference failed")
        raise HTTPException(status_code=500, detail="The Random Forest could not process this CSV.") from exc

    try:
        prediction_values = [int(value) for value in predictions]
    except (TypeError, ValueError, OverflowError) as exc:
        logger.exception("Random Forest returned a non-integer prediction")
        raise HTTPException(status_code=500, detail="The model returned an invalid prediction vector.") from exc
    if len(prediction_values) != len(frame) or not set(prediction_values).issubset({0, 1}):
        logger.error("Model returned an invalid prediction vector")
        raise HTTPException(status_code=500, detail="The model returned an invalid prediction vector.")

    results: list[dict[str, Any]] = []
    normal_count = 0
    anomaly_count = 0
    for index, prediction in enumerate(prediction_values):
        is_anomaly = prediction == 1
        normal_count += int(not is_anomaly)
        anomaly_count += int(is_anomaly)
        identifier = frame["BlockId"].iloc[index] if "BlockId" in frame.columns else None
        results.append({
            "record_id": _record_id(identifier, index),
            "prediction": prediction,
            "label": "Anomaly" if is_anomaly else "Normal",
            "training_label": "Fail" if is_anomaly else "Success",
        })

    return {
        "status": "success",
        "has_analysis": True,
        "file_name": _uploaded_file_name(file.filename),
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "total_records": len(results),
        "normal_count": normal_count,
        "anomaly_count": anomaly_count,
        "results": results,
        **model_metadata(model),
    }


if DIST_PATH.is_dir() and (DIST_PATH / "index.html").is_file():
    # API routes are registered above; this static mount is for the single-origin container.
    app.mount("/", StaticFiles(directory=str(DIST_PATH), html=True), name="frontend")
