"""API tests. Offline: the RPC fetch is replaced by eval fixtures and the LLM is off."""

import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from rektopsy import api, decode, pipeline
from rektopsy.fetch import FetchError

FIXTURES = Path(__file__).resolve().parent.parent / "eval" / "fixtures"
REFERENCE = "36V9G2WgBdWsZNdgsb1V2U4jJ9xGfNC5ehv9YeKrGnvhXjKNTgcBoJian5VtRNFBHYegjhbRWtQ1eBwmqXJEgrcg"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(decode, "IDL_CACHE", FIXTURES / "idl")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setattr(pipeline, "fetch_transaction",
                        lambda sig, use_cache=True: json.loads((FIXTURES / f"{sig}.json").read_text()))
    return TestClient(api.app)


def test_health(client):
    assert client.get("/health").json() == {"ok": True}


def test_autopsy_reference_slippage(client):
    resp = client.post("/autopsy", json={"signature": f"  {REFERENCE}\n"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["signature"] == REFERENCE
    assert body["category"] == "slippage"
    assert body["meta"]["mode"] == "template"
    assert {"cause", "fix", "funds", "evidence", "brief"} <= body.keys()


def test_bad_signature_is_400(client):
    resp = client.post("/autopsy", json={"signature": "not-a-signature"})
    assert resp.status_code == 400


def test_missing_field_is_422(client):
    assert client.post("/autopsy", json={}).status_code == 422


@pytest.mark.parametrize("exc", [FetchError("RPC error: boom"), httpx.ConnectTimeout("slow")])
def test_rpc_failure_is_502(client, monkeypatch, exc):
    def fail(sig, use_cache=True):
        raise exc
    monkeypatch.setattr(pipeline, "fetch_transaction", fail)
    assert client.post("/autopsy", json={"signature": REFERENCE}).status_code == 502


def test_cors_allows_widget_origin(client):
    resp = client.options("/autopsy", headers={"Origin": "https://example.com",
                                                "Access-Control-Request-Method": "POST"})
    assert resp.headers["access-control-allow-origin"] in ("*", "https://example.com")


def test_widget_is_served(client):
    resp = client.get("/widget.js")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/javascript")
    assert "customElements.define" in resp.text


def test_autopsy_includes_tx_summary(client):
    tx = client.post("/autopsy", json={"signature": REFERENCE}).json()["tx"]
    assert tx["failed_instruction"] == 8
    assert [s["status"] for s in tx["steps"]][7:] == ["ok", "failed", "not_run"]
    assert tx["logs"][tx["failure_log"]].endswith("custom program error: 0x1771")
    assert tx["compute_consumed"] > 0 and tx["programs_touched"] > 0


def test_prose_false_skips_llm(client, monkeypatch):
    def boom(*a, **k):
        raise AssertionError("LLM must not be called when prose is false")
    monkeypatch.setenv("GROQ_API_KEY", "test-not-used")
    monkeypatch.setattr("rektopsy.explain.complete", boom)
    body = client.post("/autopsy", json={"signature": REFERENCE, "prose": False}).json()
    assert body["meta"]["mode"] == "template" and body["meta"]["attempts"] == 0
    assert body["category"] == "slippage"
