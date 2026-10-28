from __future__ import annotations

import io
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from main import EXPECTED_FEATURES, MAX_UPLOAD_BYTES, app, load_model

ROOT = Path(__file__).resolve().parents[1]
DATASET_PATH = ROOT / "ml" / "training" / "hdfs_sample_unified.csv"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_health_reports_the_loaded_random_forest(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["model_name"] == "RandomForestClassifier"
    assert body["model_status"] == "ready"
    assert body["sklearn_version"] == "1.6.1"
    assert body["feature_count"] == 31
    assert body["class_mapping"] == {"0": "Success", "1": "Fail"}


def test_dashboard_is_truthfully_empty_before_an_upload(client: TestClient) -> None:
    response = client.get("/api/v1/dashboard")
    assert response.status_code == 200
    body = response.json()
    assert body["has_analysis"] is False
    assert body["total_records"] == 0
    assert body["normal_count"] == 0
    assert body["anomaly_count"] == 0
    assert body["results"] == []
    assert body["model_status"] == "ready"


def test_supplied_csv_results_match_direct_random_forest_predictions(client: TestClient) -> None:
    csv_bytes = DATASET_PATH.read_bytes()
    source = pd.read_csv(io.BytesIO(csv_bytes))
    features = source.loc[:, list(EXPECTED_FEATURES)].apply(pd.to_numeric, errors="raise").fillna(0)
    expected_predictions = [int(value) for value in load_model().predict(features)]

    response = client.post(
        "/api/v1/analyze",
        files={"file": ("hdfs_sample_unified.csv", csv_bytes, "text/csv")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    actual_predictions = [row["prediction"] for row in body["results"]]
    assert actual_predictions == expected_predictions
    assert body["status"] == "success"
    assert body["has_analysis"] is True
    assert body["file_name"] == "hdfs_sample_unified.csv"
    assert body["total_records"] == len(source) == 2000
    assert body["normal_count"] == expected_predictions.count(0) == 1953
    assert body["anomaly_count"] == expected_predictions.count(1) == 47
    assert body["normal_count"] + body["anomaly_count"] == body["total_records"]
    assert body["results"][0]["record_id"] == str(source["BlockId"].iloc[0])
    assert body["results"][0]["label"] == ("Anomaly" if expected_predictions[0] else "Normal")
    assert body["results"][0]["training_label"] == ("Fail" if expected_predictions[0] else "Success")


def test_model_loader_fails_closed_when_artifact_is_missing(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="Required model artifact is missing"):
        load_model(tmp_path / "missing-model.pkl")


def test_non_csv_upload_is_rejected(client: TestClient) -> None:
    response = client.post("/api/v1/analyze", files={"file": ("logs.txt", b"row", "text/plain")})
    assert response.status_code == 400
    assert "Only .csv" in response.json()["detail"]


def test_upload_requires_all_trained_feature_columns(client: TestClient) -> None:
    csv = b"E1,Type_y\n1,2\n"
    response = client.post("/api/v1/analyze", files={"file": ("incomplete.csv", csv, "text/csv")})
    assert response.status_code == 422
    assert "missing required model feature columns" in response.json()["detail"]


def test_non_numeric_trained_feature_is_rejected(client: TestClient) -> None:
    headers = ",".join(EXPECTED_FEATURES)
    values = ["invalid"] + ["1"] * (len(EXPECTED_FEATURES) - 1)
    response = client.post(
        "/api/v1/analyze",
        files={"file": ("invalid-feature.csv", f"{headers}\n{','.join(values)}\n".encode(), "text/csv")},
    )
    assert response.status_code == 422
    assert "must contain numeric values" in response.json()["detail"]


def test_upload_size_limit_is_enforced_server_side(client: TestClient) -> None:
    response = client.post(
        "/api/v1/analyze",
        files={"file": ("oversize.csv", b"x" * (MAX_UPLOAD_BYTES + 1), "text/csv")},
    )
    assert response.status_code == 413
    assert "15 MiB" in response.json()["detail"]


def test_cors_allows_the_explicit_local_frontend_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/analyze",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
