"""Download the scam-check training data into scam/data/ (gitignored).

Usage: uv run python scam/fetch_data.py

Sources (all allow reuse with credit):
- Discord scam/clean messages, MIT
  https://huggingface.co/datasets/wangyuancheng/discord-phishing-scam-clean
- SMS Spam Collection, CC BY 4.0
  https://archive.ics.uci.edu/dataset/228/sms+spam+collection
- Solana Stack Exchange questions, CC BY-SA (official API): normal crypto talk,
  so the model doesn't learn "mentions a wallet = scam".

Writes scam/data/messages.jsonl: {"text", "label" (1 scam, 0 clean), "source"}.
"""

import csv
import html
import io
import json
import re
import time
import zipfile
from pathlib import Path

import httpx

DATA = Path(__file__).resolve().parent / "data"
DISCORD = ("https://huggingface.co/datasets/wangyuancheng/discord-phishing-scam-clean"
           "/resolve/main/discord-phishing-scam-detection.csv")
SMS = "https://archive.ics.uci.edu/static/public/228/sms+spam+collection.zip"
STACK = "https://api.stackexchange.com/2.3/questions"
STACK_PAGES = 20  # 100 questions each; the keyless quota is 300 requests/day

URL_RE = re.compile(r"https?://\S+|www\.\S+", re.I)


def normalize(text: str) -> str:
    """Match the Discord set's placeholders so sources look alike to the model."""
    text = URL_RE.sub("<URL>", text)
    return re.sub(r"\s+", " ", text).strip()


def discord(client: httpx.Client) -> list[dict]:
    rows = csv.DictReader(io.StringIO(client.get(DISCORD).text))
    return [{"text": normalize(r["msg_content"]), "label": int(r["label"]), "source": "discord"}
            for r in rows]


def sms(client: httpx.Client) -> list[dict]:
    raw = zipfile.ZipFile(io.BytesIO(client.get(SMS).content)).read("SMSSpamCollection")
    out = []
    for line in raw.decode("utf-8", "replace").splitlines():
        tag, _, text = line.partition("\t")
        out.append({"text": normalize(text), "label": int(tag == "spam"), "source": "sms"})
    return out


def first_sentence(body_html: str) -> str:
    body = re.sub(r"<pre>.*?</pre>|<code>.*?</code>", " ", body_html, flags=re.S)
    body = html.unescape(re.sub(r"<[^>]+>", " ", body))
    return re.split(r"(?<=[.?!])\s", body.strip(), maxsplit=1)[0][:200]


def stack(client: httpx.Client) -> list[dict]:
    out = []
    for page in range(1, STACK_PAGES + 1):
        r = client.get(STACK, params={"site": "solana", "pagesize": 100, "page": page,
                                      "order": "desc", "sort": "creation", "filter": "withbody"})
        r.raise_for_status()
        d = r.json()
        for q in d["items"]:
            text = f"{html.unescape(q['title'])} {first_sentence(q.get('body', ''))}"
            out.append({"text": normalize(text), "label": 0, "source": "solana_se"})
        if not d.get("has_more"):
            break
        time.sleep(d.get("backoff", 0) + 0.5)
    return out


def main() -> None:
    DATA.mkdir(exist_ok=True)
    rows = []
    with httpx.Client(follow_redirects=True, timeout=60) as client:
        for name, fn in [("discord", discord), ("sms", sms), ("solana_se", stack)]:
            got = [r for r in fn(client) if len(r["text"].split()) >= 3]
            print(f"{name}: {len(got)} messages, {sum(r['label'] for r in got)} scam")
            rows += got
    seen, unique = set(), []
    for r in rows:
        key = r["text"].lower()
        if key not in seen:
            seen.add(key)
            unique.append(r)
    with open(DATA / "messages.jsonl", "w") as f:
        for r in unique:
            f.write(json.dumps(r) + "\n")
    print(f"total: {len(unique)} unique, {sum(r['label'] for r in unique)} scam")


if __name__ == "__main__":
    main()
