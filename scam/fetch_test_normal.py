"""Download real normal Solana messages for the test set (never used in training).

Usage: uv run python scam/fetch_test_normal.py

- Solana Stack Exchange questions older than the ones in training (pages after
  scam/fetch_data.py's STACK_PAGES), CC BY-SA.
- Solana forum topics (forum.solana.com, Discourse public JSON): title + first
  sentence of the opening post.

Anything whose text also appears in the training data is dropped. Writes
scam/data/test_normal.jsonl (gitignored, like the training data).
"""

import html
import json
import re
import time
from pathlib import Path

import httpx

from fetch_data import STACK, STACK_PAGES, first_sentence, normalize

DATA = Path(__file__).resolve().parent / "data"
EXTRA_STACK_PAGES = 5  # 500 questions
FORUM = "https://forum.solana.com"
FORUM_PAGES = 5  # 30 topics each


def stack(client: httpx.Client) -> list[dict]:
    out = []
    for page in range(STACK_PAGES + 1, STACK_PAGES + EXTRA_STACK_PAGES + 1):
        r = client.get(STACK, params={"site": "solana", "pagesize": 100, "page": page,
                                      "order": "desc", "sort": "creation", "filter": "withbody"})
        r.raise_for_status()
        d = r.json()
        for q in d["items"]:
            text = f"{html.unescape(q['title'])} {first_sentence(q.get('body', ''))}"
            out.append({"text": normalize(text), "label": 0, "source": "solana_se_older",
                        "url": q["link"]})
        time.sleep(d.get("backoff", 0) + 0.5)
    return out


def forum(client: httpx.Client) -> list[dict]:
    out = []
    for page in range(FORUM_PAGES):
        topics = client.get(f"{FORUM}/latest.json", params={"page": page}).json()["topic_list"]["topics"]
        for t in topics:
            time.sleep(0.4)
            r = client.get(f"{FORUM}/t/{t['id']}.json")
            if r.status_code != 200:
                continue
            posts = r.json()["post_stream"]["posts"]
            body = first_sentence(posts[0]["cooked"]) if posts else ""
            out.append({"text": normalize(f"{t['title']} {body}"), "label": 0, "source": "solana_forum",
                        "url": f"{FORUM}/t/{t['slug']}/{t['id']}"})
    return out


def main() -> None:
    seen = {json.loads(line)["text"].lower() for line in open(DATA / "messages.jsonl")}
    rows = []
    with httpx.Client(follow_redirects=True, timeout=60,
                      headers={"User-Agent": "rektopsy-eval/0.1"}) as client:
        for name, fn in [("solana_se_older", stack), ("solana_forum", forum)]:
            got = [r for r in fn(client) if len(r["text"].split()) >= 3]
            fresh = [r for r in got if r["text"].lower() not in seen]
            seen |= {r["text"].lower() for r in fresh}
            print(f"{name}: {len(fresh)} new ({len(got) - len(fresh)} already in training or repeated)")
            rows += fresh
    with open(DATA / "test_normal.jsonl", "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    print(f"total: {len(rows)}")


if __name__ == "__main__":
    main()
