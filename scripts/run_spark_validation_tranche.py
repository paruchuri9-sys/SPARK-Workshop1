#!/usr/bin/env python3
"""
Run the frozen SPARK Alpha 1 validation tranche against the deployed webapp.

Usage:
  python scripts/run_spark_validation_tranche.py
  python scripts/run_spark_validation_tranche.py --only T04,T05,T06
  python scripts/run_spark_validation_tranche.py --delay 2

Outputs:
  validation_runs/<timestamp>/
    T01.json ... T12.json
    summary.json
    summary.csv

This runner executes DISCOVER only. Human/research review remains separate.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

BASE_URL = "https://bd4efxey67kgdhwmeppp6tyl3e0diqlm.lambda-url.us-east-1.on.aws"
MANIFEST = pathlib.Path(__file__).resolve().parents[1] / "docs" / "spark_alpha1_validation_tranche_01.json"


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "svg"):
            self.skip += 1
        elif tag in ("p", "div", "section", "article", "li", "br", "h1", "h2", "h3", "h4"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg") and self.skip:
            self.skip -= 1
        elif tag in ("p", "div", "section", "article", "li", "h1", "h2", "h3", "h4"):
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def fetch_lesson_locally(url: str, timeout: int = 45) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read(10 * 1024 * 1024)
        ctype = (resp.headers.get("Content-Type") or "").lower()
    if "html" not in ctype and not url.lower().endswith((".html", ".htm")):
        return ""
    parser = _TextExtractor()
    parser.feed(raw.decode("utf-8", errors="replace"))
    text = "\n".join(line.strip() for line in "".join(parser.parts).splitlines() if line.strip())
    return text[:120000]


def post_form(url: str, fields: dict[str, str], timeout: int = 180) -> tuple[int, dict]:
    body = urllib.parse.urlencode(fields).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "SPARK-Validation-Runner/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {"detail": raw}
        return e.code, payload


def run_lesson(lesson: dict, retries: int = 2) -> dict:
    fields = {
        "lesson_name": lesson.get("title", ""),
        "grade_course": lesson.get("grade", ""),
        "duration": "",
        "objective": "",
        "educator_input": "",
        "pasted_text": "",
        "source_url": lesson.get("url", ""),
    }

    last = None
    for attempt in range(retries + 1):
        started = time.perf_counter()
        status, payload = post_form(BASE_URL + "/api/discover", fields)
        elapsed = round(time.perf_counter() - started, 2)

        result = {
            "tranche_id": lesson.get("id"),
            "lesson": lesson,
            "http_status": status,
            "elapsed_seconds": elapsed,
            "response": payload,
            "source_mode": "remote_url",
        }
        last = result

        if 200 <= status < 300:
            return result

        # If the Lambda is blocked by the source site, retrieve the public lesson
        # from the local machine and submit its extracted text instead.
        detail = str((payload or {}).get("detail", ""))
        if status == 400 and "HTTP 403" in detail and fields.get("source_url"):
            try:
                local_text = fetch_lesson_locally(fields["source_url"])
                if local_text:
                    fallback_fields = dict(fields)
                    fallback_fields["pasted_text"] = local_text
                    fallback_fields["source_url"] = ""
                    fb_started = time.perf_counter()
                    fb_status, fb_payload = post_form(BASE_URL + "/api/discover", fallback_fields)
                    fb_elapsed = round(time.perf_counter() - fb_started, 2)
                    return {
                        "tranche_id": lesson.get("id"),
                        "lesson": lesson,
                        "http_status": fb_status,
                        "elapsed_seconds": fb_elapsed,
                        "response": fb_payload,
                        "source_mode": "local_fetch_fallback",
                        "local_source_chars": len(local_text),
                        "initial_remote_error": detail,
                    }
            except Exception as e:
                result["local_fetch_error"] = f"{type(e).__name__}: {e}"

        # Retry transient server/rate-limit errors only.
        if status not in (429, 500, 502, 503, 504) or attempt >= retries:
            return result

        time.sleep(3 * (attempt + 1))

    return last


def summarize(result: dict) -> dict:
    lesson = result["lesson"]
    payload = result.get("response") or {}
    discovery = payload.get("discovery") or {}
    timing = payload.get("timing") or {}

    return {
        "id": lesson.get("id"),
        "title": lesson.get("title"),
        "domain": lesson.get("domain"),
        "grade": lesson.get("grade"),
        "status": "ok" if 200 <= result.get("http_status", 0) < 300 else "error",
        "http_status": result.get("http_status"),
        "session_id": payload.get("session_id", ""),
        "candidate_count": len(discovery.get("candidates") or []),
        "surfaced_count": len(discovery.get("surfaced_moments") or []),
        "total_ms": timing.get("total_ms"),
        "runner_elapsed_seconds": result.get("elapsed_seconds"),
        "source_mode": result.get("source_mode", ""),
        "local_source_chars": result.get("local_source_chars", ""),
        "error": "" if 200 <= result.get("http_status", 0) < 300 else str(payload.get("detail", payload))[:500],
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--only", help="Comma-separated lesson IDs, e.g. T04,T05,T06")
    p.add_argument("--delay", type=float, default=1.0, help="Seconds between runs")
    p.add_argument("--retries", type=int, default=2)
    p.add_argument("--base-url", default=BASE_URL)
    args = p.parse_args()

    base_url = args.base_url.rstrip("/")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    lessons = list(manifest.get("lessons", [])) + list(manifest.get("replacements", []))

    if args.only:
        wanted = {x.strip() for x in args.only.split(",") if x.strip()}
        lessons = [x for x in lessons if x.get("id") in wanted]

    if not lessons:
        print("No lessons selected.", file=sys.stderr)
        return 2

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    outdir = pathlib.Path("validation_runs") / stamp
    outdir.mkdir(parents=True, exist_ok=True)

    summaries = []

    print(f"SPARK validation tranche: {manifest.get('tranche_id')}")
    print(f"Endpoint: {base_url}/api/discover")
    print(f"Lessons: {len(lessons)}")
    print(f"Output: {outdir}")
    print()

    for idx, lesson in enumerate(lessons, start=1):
        lesson_id = lesson["id"]
        print(f"[{idx}/{len(lessons)}] {lesson_id} - {lesson['title']}")
        original_base = BASE_URL
        globals()["BASE_URL"] = base_url
        try:
            result = run_lesson(lesson, retries=args.retries)
        finally:
            globals()["BASE_URL"] = original_base

        path = outdir / f"{lesson_id}.json"
        path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

        row = summarize(result)
        summaries.append(row)

        if row["status"] == "ok":
            print(
                f"  OK session={row['session_id']} "
                f"candidates={row['candidate_count']} surfaced={row['surfaced_count']} "
                f"total_ms={row['total_ms']}"
            )
        else:
            print(f"  ERROR HTTP {row['http_status']}: {row['error']}")

        if idx < len(lessons):
            time.sleep(args.delay)

    (outdir / "summary.json").write_text(
        json.dumps(
            {
                "tranche_id": manifest.get("tranche_id"),
                "runtime": {
                    "model": manifest.get("model"),
                    "reasoning_effort": manifest.get("reasoning_effort"),
                    "prompt_version": manifest.get("prompt_version"),
                    "schema_version": manifest.get("schema_version"),
                },
                "runs": summaries,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    with (outdir / "summary.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(summaries[0].keys()))
        w.writeheader()
        w.writerows(summaries)

    ok = sum(1 for x in summaries if x["status"] == "ok")
    print()
    print(f"Complete: {ok}/{len(summaries)} successful")
    print(f"Summary: {outdir / 'summary.csv'}")
    return 0 if ok == len(summaries) else 1


if __name__ == "__main__":
    raise SystemExit(main())
