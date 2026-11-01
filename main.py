"""SiteAPI: turn any website into a JSON API with a TinyFish web agent."""
import json
import os
import re
import sqlite3
import time
from contextlib import closing
from typing import Any, Optional

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

TF_URL = "https://agent.tinyfish.ai/v1/automation/run-sse"
API_KEY = os.getenv("TINYFISH_API_KEY", "")
DB_PATH = os.path.join(os.path.dirname(__file__), "siteapi.db")
JSON_SUFFIX = "\n\nReturn the final answer as valid JSON only."

app = FastAPI(title="SiteAPI")


# ---------- storage ----------
def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


with closing(db()) as _c:
    _c.execute(
        """CREATE TABLE IF NOT EXISTS endpoints (
            slug TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            goal TEXT NOT NULL,
            last_result TEXT,
            last_run_at REAL,
            created_at REAL NOT NULL
        )"""
    )
    _c.commit()


def normalize_url(url: str) -> str:
    url = url.strip()
    if url and not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    return url


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "endpoint"


# ---------- TinyFish helpers ----------
RESULT_KEYS = ("resultJson", "result", "output")
FINAL_TYPES = {"COMPLETE", "COMPLETED", "DONE", "FINISHED", "SUCCESS"}
ERROR_TYPES = {"ERROR", "FAILED", "FAILURE"}
LIVE_VIEW_KEYS = ("streamingUrl", "streaming_url", "browserUrl", "liveUrl")


def extract_result(ev: dict) -> Any:
    """Pull the agent's answer out of an event. Adjust here if field names differ."""
    for k in RESULT_KEYS:
        v = ev.get(k)
        if v not in (None, "", {}, []):
            if isinstance(v, str):
                try:
                    return json.loads(v)
                except json.JSONDecodeError:
                    return v
            return v
    return None


def event_kind(ev: dict) -> str:
    return str(ev.get("type") or ev.get("status") or "").upper()


async def stream_agent(url: str, goal: str):
    """Yield parsed TinyFish events, then one SITEAPI_RESULT event with the answer."""
    if not API_KEY:
        yield {"type": "ERROR", "message": "TINYFISH_API_KEY is not set on the server."}
        return

    payload = {"url": normalize_url(url), "goal": goal + JSON_SUFFIX}
    headers = {"X-API-Key": API_KEY, "Content-Type": "application/json"}
    result = None
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=15)) as client:
            async with client.stream("POST", TF_URL, json=payload, headers=headers) as r:
                if r.status_code >= 400:
                    body = (await r.aread()).decode(errors="ignore")[:400]
                    yield {"type": "ERROR", "message": f"TinyFish returned {r.status_code}: {body}"}
                    return
                async for line in r.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    try:
                        ev = json.loads(raw)
                    except json.JSONDecodeError:
                        ev = {"type": "RAW", "message": raw}
                    if isinstance(ev, dict):
                        found = extract_result(ev)
                        if found is not None and (event_kind(ev) in FINAL_TYPES or result is None):
                            result = found
                    yield ev if isinstance(ev, dict) else {"type": "RAW", "message": str(ev)}
    except httpx.HTTPError as e:
        yield {"type": "ERROR", "message": f"Network error talking to TinyFish: {e}"}
        return

    if result is not None:
        yield {"type": "SITEAPI_RESULT", "data": result}
    else:
        yield {"type": "ERROR", "message": "The agent finished without returning a result."}


async def run_once(url: str, goal: str) -> Any:
    result = None
    async for ev in stream_agent(url, goal):
        kind = ev.get("type")
        if kind == "SITEAPI_RESULT":
            result = ev["data"]
        elif str(kind).upper() in ERROR_TYPES:
            raise HTTPException(502, ev.get("message") or "Agent run failed")
    if result is None:
        raise HTTPException(502, "Agent returned no result")
    return result


# ---------- API ----------
class TestBody(BaseModel):
    url: str
    goal: str


class CreateBody(BaseModel):
    name: str
    url: str
    goal: str
    sample: Optional[Any] = None


@app.post("/api/test")
async def test_run(body: TestBody):
    async def gen():
        try:
            async for ev in stream_agent(body.url, body.goal):
                yield f"data: {json.dumps(ev)}\n\n"
        except Exception as e:  # report instead of dropping the connection
            err = {"type": "ERROR", "message": f"Server error: {type(e).__name__}: {e}"}
            yield f"data: {json.dumps(err)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


def row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["last_result"] = json.loads(d["last_result"]) if d["last_result"] else None
    d["params"] = sorted(set(re.findall(r"\{\{(\w+)\}\}", d["goal"])))
    return d


@app.get("/api/endpoints")
def list_endpoints():
    with closing(db()) as c:
        rows = c.execute("SELECT * FROM endpoints ORDER BY created_at DESC").fetchall()
    return [row_to_dict(r) for r in rows]


@app.post("/api/endpoints")
def create_endpoint(body: CreateBody):
    base = slugify(body.name)
    slug, n = base, 2
    with closing(db()) as c:
        while c.execute("SELECT 1 FROM endpoints WHERE slug=?", (slug,)).fetchone():
            slug, n = f"{base}-{n}", n + 1
        now = time.time()
        c.execute(
            "INSERT INTO endpoints (slug,name,url,goal,last_result,last_run_at,created_at) VALUES (?,?,?,?,?,?,?)",
            (
                slug,
                body.name,
                normalize_url(body.url),
                body.goal,
                json.dumps(body.sample) if body.sample is not None else None,
                now if body.sample is not None else None,
                now,
            ),
        )
        c.commit()
        row = c.execute("SELECT * FROM endpoints WHERE slug=?", (slug,)).fetchone()
    return row_to_dict(row)


@app.delete("/api/endpoints/{slug}")
def delete_endpoint(slug: str):
    with closing(db()) as c:
        c.execute("DELETE FROM endpoints WHERE slug=?", (slug,))
        c.commit()
    return {"deleted": slug}


@app.get("/v1/{slug}")
async def call_endpoint(slug: str, request: Request, cached: bool = False):
    """Run a saved endpoint. Use ?cached=true for the last saved result.
    Goals may contain {{placeholders}} which are filled from query params."""
    with closing(db()) as c:
        row = c.execute("SELECT * FROM endpoints WHERE slug=?", (slug,)).fetchone()
    if not row:
        raise HTTPException(404, f"No endpoint called '{slug}'")

    if cached and row["last_result"]:
        return {
            "slug": slug,
            "source": "cache",
            "ran_at": row["last_run_at"],
            "data": json.loads(row["last_result"]),
        }

    params = {k: v for k, v in request.query_params.items() if k != "cached"}
    needed = set(re.findall(r"\{\{(\w+)\}\}", row["goal"]))
    missing = needed - set(params)
    if missing:
        raise HTTPException(400, f"Missing query parameter(s): {', '.join(sorted(missing))}")
    goal = re.sub(r"\{\{(\w+)\}\}", lambda m: params[m.group(1)], row["goal"])

    data = await run_once(row["url"], goal)

    if not needed:  # only cache parameter-free endpoints
        with closing(db()) as c:
            c.execute(
                "UPDATE endpoints SET last_result=?, last_run_at=? WHERE slug=?",
                (json.dumps(data), time.time(), slug),
            )
            c.commit()
    return {"slug": slug, "source": "live", "ran_at": time.time(), "data": data}


app.mount(
    "/",
    StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static"), html=True),
    name="static",
)
