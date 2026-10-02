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

BASE_URL = "https://bd4efxey67kgdhwmeppp6tyl3e0diqlm.lambda-url.us-east-1.on.aws"
MANIFEST = pathlib.Path(__file__).resolve().parents[1] / "docs" / "spark_alpha1_validation_tranche_01.json"


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
        }
        last = result

        if 200 <= status < 300:
            return result

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
        "error": "" if 200 <= result.get("http_status", 0) < 300 else str(payload.get("detail", payload))[:500],
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--only", help="Comma-separated lesson IDs, e.g. T04,T05,T06")
    p.add_argument("--delay", type=float, default=1.0, help="Seconds between runs")
    p.add_argument("--retries", type=int, default=2)
    p.add_argument("--base-url", default=BASE_URL)
    args = p.parse_args()

    global BASE_URL
    BASE_URL = args.base_url.rstrip("/")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    lessons = manifest["lessons"]

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
    print(f"Endpoint: {BASE_URL}/api/discover")
    print(f"Lessons: {len(lessons)}")
    print(f"Output: {outdir}")
    print()

    for idx, lesson in enumerate(lessons, start=1):
        lesson_id = lesson["id"]
        print(f"[{idx}/{len(lessons)}] {lesson_id} - {lesson['title']}")
        result = run_lesson(lesson, retries=args.retries)

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
