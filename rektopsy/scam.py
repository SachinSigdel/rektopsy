"""Scam check: red flags in a pasted message or link, each with a quoted span.

`check_message(text)` returns a facts dict. Python decides everything here; the
LLM (later) only turns these facts into sentences.

Three kinds of evidence:
- rules: fixed patterns for the scams a model can miss (seed phrase requests,
  send-1-get-2, sign-to-claim). Each red flag quotes the words that matched.
- links: each domain is checked against official sites (look-alike spellings)
  and public phishing blocklists (see `blocklists`).
- model: a text classifier trained in scam/train.py (TF-IDF + logistic
  regression), scored here in plain Python. A second opinion only: it can turn
  "no red flags" into "suspicious", never into "likely scam", and it names the
  words that pushed its score up.

Verdicts never say "safe": the best one is "no_red_flags".
"""

import json
import math
import re
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import httpx

# ---------------------------------------------------------------- rules

HIGH, MEDIUM = "high", "medium"

# Words that turn a match into a warning ("never share your seed phrase").
NEGATION = re.compile(r"\b(never|don'?t|do not|won'?t|will not|no one|nobody|not)\b", re.I)
NEGATION_WINDOW = 40  # characters before the match

SECRET = (r"(seed|recovery|secret|backup|mnemonic|wallet)\s*(phrase|words?|key)"
          r"|private\s*key|secret\s*key|mnemonic|(12|24)[- ]?words?")
CLAIM_WORDS = r"claim|airdrop|reward|eligib|whitelist|migrat|mint|unlock|receive|keep"


@dataclass(frozen=True)
class Rule:
    id: str
    severity: str
    title: str  # plain-English name shown to the user
    why: str  # one line: why this is a scam signal
    pattern: re.Pattern
    negatable: bool = False  # skip when a negation sits just before it
    needs: re.Pattern | None = None  # only fires if this also appears anywhere


def _re(p: str) -> re.Pattern:
    return re.compile(p, re.I)


RULES = [
    Rule("secret_request", HIGH, "Asks for your secret phrase or private key",
         "Anyone with these words owns your wallet. No real support team, app or "
         "wallet ever asks for them.",
         _re(r"\b(share|send|give|enter|provide|type|paste|submit|import|input|tell|dm|"
             r"verify|confirm|sync|need)\b[^.!?\n]{0,20}?\b(your|ur|me|us)\b"
             r"(?:(?!\bmy\b)[^.!?\n]){0,25}?\b(" + SECRET + r")\b"),
         negatable=True),
    Rule("send_to_get_more", HIGH, "Send crypto to get more back",
         "Giveaways that ask you to send first are always scams. The money never comes back.",
         _re(r"\bsend\s+(me\s+|us\s+)?(\$?\d[\d.,]*\s*)?(sol|usdc|usdt|eth|btc|crypto|tokens?)\b"
             r"[^.!?\n]{0,40}?\b(get|receive|return)\b[^.!?\n]{0,30}?(\d|double|twice|2x|back)"
             r"|\b(double|triple|2x|3x)\s+(your\s+)?(sol|crypto|money|tokens?|funds|investment)\b")),
    Rule("guaranteed_returns", HIGH, "Promises guaranteed or fast profits",
         "Nobody can guarantee trading profits. Promised daily returns are how "
         "investment scams start.",
         _re(r"\bguarantee[sd]?\b[^.!?\n]{0,30}?\b(returns?|profits?|income|gains?)\b"
             r"|\b\d+(\.\d+)?\s*%\s*(daily|per day|a day|weekly|per week|every day)\b"
             r"|\brisk[- ]?free\s+(profits?|returns?|income|trading)\b"
             r"|\bearn(ing)?\s+\$?\d[\d,]*[^.!?\n]{0,40}?\b(within|in)\s+\d+\s*(hours?|hrs?|days?)\b")),
    Rule("verify_wallet", HIGH, "Asks you to verify or sync your wallet",
         "Wallets don't need verifying, syncing or validating. These pages drain "
         "whatever you sign.",
         _re(r"\b(verify|validate|sync|synchroni[sz]e|rectify|restore|re-?activate|unlock)\s+"
             r"(your\s+|ur\s+|the\s+)?wallets?\b"),
         negatable=True),
    Rule("wallet_to_claim", HIGH, "Connect or sign to claim something",
         "Fake airdrop and migration sites ask you to connect and sign. The "
         "signature hands over your tokens.",
         _re(r"\b(connect|link|approve|sign)\b[^.!?\n]{0,50}?\b(" + CLAIM_WORDS + r")"
             r"|\b(" + CLAIM_WORDS + r")\w*\b[^.!?\n]{0,50}?\b(connect|approve|sign)\b"),
         negatable=True,
         needs=_re(r"\bwallet|\bsign|\bapprove|<URL>|https?://|\w\.\w")),
    Rule("impersonation", MEDIUM, "Claims to be support, staff or the team",
         "Real teams don't message you first. Scammers pose as support to gain trust.",
         _re(r"\b(i'?m|i am|this is|we are|we'?re)\s+(from\s+|with\s+|the\s+|an?\s+|official\s+)?"
             r"(\w+\s+){0,2}(support|team|admins?|moderators?|mods?|staff|help\s?desk|"
             r"customer service)\b"
             r"|(^|[.!?,]\s*)(support|team|admin|moderator|mod|staff)\s+here\b")),
    Rule("unsolicited_help", MEDIUM, "Offers help you didn't ask for",
         "\"Recovery\" helpers and DMs offering support are a common follow-up scam.",
         _re(r"\b(dm|message|inbox)\s+me\b"
             r"|\b(help|assist)\s+you\s+(to\s+)?(recover|restore|get back|retrieve|fix)\b"
             r"|\brecover\s+(your\s+)?(funds|wallet|tokens|sol|money|crypto)\b"
             r"|\b(i|we)\s+noticed\s+(your|you)\b")),
    Rule("fake_threat", MEDIUM, "Says your wallet is in danger",
         "Scares push you to act fast without checking.",
         _re(r"\b(wallet|account|funds|assets)\s+(has been|have been|was|is|are|will be)\s+"
             r"(compromised|hacked|suspended|locked|flagged|restricted|blocked|disabled|at risk)\b"
             r"|\b(about to be|will be|going to be)\s+(liquidated|removed|deleted|suspended|frozen)\b")),
    Rule("free_reward", MEDIUM, "Offers free tokens or rewards",
         "Unexpected rewards are bait to get you to a phishing site.",
         _re(r"\b(unclaimed|pending)\s+(rewards?|airdrops?|tokens?|funds)\b"
             r"|\byou(?:'re| are| have been)\s+(eligible|selected|chosen|whitelisted)\b"
             r"|\b(free|surprise)\s+(airdrops?|mint|sol|tokens?|nfts?|giveaway)\b"
             r"|\bcongrat\w*\b[^.!?\n]{0,40}?\b(won|win|winner|eligible|selected)\b")),
    Rule("urgency", MEDIUM, "Pushes you to hurry",
         "Deadlines stop you from checking. Real offers don't vanish in an hour.",
         _re(r"\b(expires?|ending|ends)\s+(in|within|soon|today)\b"
             r"|\bwithin\s+\d+\s*(min|mins|minutes|hours?|hrs?)\b"
             r"|\bonly\s+\d+\s+(spots?|slots?|left|remaining|places?)\b"
             r"|\blimited\s+(time|spots|slots)\b"
             r"|\b(act|claim|hurry|join)\s+(now|fast|quickly)\b"
             r"|\blast\s+chance\b"
             r"|\bbefore\s+it'?s?\s+(too late|gone|expires?)\b"
             r"|\bor\s+(you\s+will\s+)?(lose|forfeit)\b")),
]


def _sentence(text: str, start: int, end: int, limit: int = 200) -> str:
    """The sentence around a match, so the quote reads naturally."""
    left = max(text.rfind(c, 0, start) for c in ".!?\n") + 1
    rights = [i for i in (text.find(c, end) for c in ".!?\n") if i != -1]
    right = min(rights) + 1 if rights else len(text)
    quote = text[left:right].strip()
    return quote if len(quote) <= limit else text[start:end].strip()


def check_rules(text: str) -> list[dict]:
    flags = []
    for rule in RULES:
        if rule.needs and not rule.needs.search(text):
            continue
        for m in rule.pattern.finditer(text):
            before = text[max(0, m.start() - NEGATION_WINDOW):m.start()]
            if rule.negatable and NEGATION.search(before):
                continue
            flags.append({"rule": rule.id, "severity": rule.severity, "title": rule.title,
                          "why": rule.why, "match": m.group(0).strip(),
                          "quote": _sentence(text, m.start(), m.end()),
                          "start": m.start(), "end": m.end()})
            break  # one quote per rule is enough
    return flags


# ---------------------------------------------------------------- links

# Official domains people get impersonated as. `names` are the brand words a
# look-alike would copy; `contains` also flags hosts that merely contain them.
OFFICIAL = {
    "phantom.app": {"names": ["phantom"], "contains": True},
    "jup.ag": {"names": ["jupiter", "jup"], "contains": False},
    "raydium.io": {"names": ["raydium"], "contains": True},
    "solana.com": {"names": ["solana"], "contains": False},
    "solflare.com": {"names": ["solflare"], "contains": True},
    "magiceden.io": {"names": ["magiceden"], "contains": True},
    "orca.so": {"names": ["orca"], "contains": False},
    "meteora.ag": {"names": ["meteora"], "contains": True},
    "tensor.trade": {"names": ["tensor"], "contains": False},
    "pump.fun": {"names": ["pump"], "contains": False},
    "solscan.io": {"names": ["solscan"], "contains": True},
    "backpack.app": {"names": ["backpack"], "contains": False},
    "marinade.finance": {"names": ["marinade"], "contains": True},
    "drift.trade": {"names": ["drift"], "contains": False},
    "kamino.finance": {"names": ["kamino"], "contains": True},
    "metamask.io": {"names": ["metamask"], "contains": True},
    "discord.com": {"names": ["discord"], "contains": False},
    "rektopsy.vercel.app": {"names": ["rektopsy"], "contains": True},
}
# Hosts that belong to an official site even though they don't share its domain.
OFFICIAL_ALSO = {"discord.gg": "discord.com", "solana.org": "solana.com",
                 "jupiter.ag": "jup.ag", "x.com": "x.com", "twitter.com": "x.com",
                 "t.me": "t.me", "github.com": "github.com", "youtube.com": "youtube.com"}
SHORTENERS = {"bit.ly", "tinyurl.com", "cutt.ly", "rb.gy", "is.gd", "goo.gl", "t.ly",
              "shorturl.at", "rebrand.ly", "ow.ly", "tiny.cc", "s.id"}

HOST_RE = re.compile(
    r"(?:https?://)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:xn--[a-z0-9-]+|[a-z]{2,24}))"
    r"(?=[/:?#\s)\]>,'\"]|\.(?:\s|$)|$)", re.I)
# Character swaps scammers use: phant0m, jup1ter, raydlum, rnetamask.
SKELETON = [("rn", "m"), ("vv", "w"), ("0", "o"), ("1", "l"), ("i", "l"), ("3", "e"),
            ("5", "s"), ("4", "a"), ("@", "a"), ("-", ""), ("_", "")]


def _skeleton(s: str) -> str:
    s = unicodedata.normalize("NFKC", s.lower())
    for a, b in SKELETON:
        s = s.replace(a, b)
    return s


def _edit_distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _site(host: str) -> str:
    """Registrable part, roughly: the last two labels."""
    return ".".join(host.split(".")[-2:])


def _official_for(host: str) -> str | None:
    for dom in list(OFFICIAL) + list(OFFICIAL_ALSO):
        if host == dom or host.endswith("." + dom):
            return OFFICIAL_ALSO.get(dom, dom)
    return None


def _lookalike(host: str) -> tuple[str, str] | None:
    """(official domain, reason) if the host imitates an official one."""
    if any(label.startswith("xn--") for label in host.split(".")):
        return "", "uses look-alike letters from other alphabets (punycode)"
    name = host.split(".")[-2] if host.count(".") >= 1 else host
    labels = host.split(".")[:-1]
    for dom, info in OFFICIAL.items():
        for brand in info["names"]:
            if name != brand and _skeleton(name) == _skeleton(brand):
                return dom, f'"{name}" is spelled to look like "{brand}"'
            if len(brand) >= 5 and len(name) >= 5 and name != brand and _edit_distance(name, brand) == 1:
                return dom, f'"{name}" is one letter away from "{brand}"'
            if info["contains"] and any(brand in _skeleton(lbl) for lbl in labels):
                return dom, f'uses the name "{brand}" but is not {dom}'
    return None


def find_hosts(text: str) -> list[str]:
    hosts = []
    for m in HOST_RE.finditer(text):
        host = m.group(1).lower().rstrip(".")
        if host.startswith("www."):
            host = host[4:]
        # Skip things like "e.g" or file names that the pattern also matches.
        if host.rsplit(".", 1)[-1] in {"js", "py", "ts", "json", "txt", "png", "jpg", "md"}:
            continue
        if host not in hosts:
            hosts.append(host)
    return hosts


def check_links(text: str, lists: "Blocklists | None" = None) -> tuple[list[dict], list[dict]]:
    """(links, red flags). Every host found gets a status with its reason."""
    lists = lists if lists is not None else blocklists()
    links, flags = [], []
    for host in find_hosts(text):
        official = _official_for(host)
        if official:
            links.append({"host": host, "status": "official", "detail": f"official {official} domain"})
            continue
        hit = lists.lookup(host)
        if hit:
            links.append({"host": host, "status": "blocklisted", "detail": f"on {hit}"})
            flags.append({"rule": "blocklisted_link", "severity": HIGH,
                          "title": "Link is a known phishing site",
                          "why": f"{host} is listed as phishing on {hit}.",
                          "match": host, "quote": host})
            continue
        look = _lookalike(host)
        if look:
            dom, reason = look
            links.append({"host": host, "status": "lookalike", "detail": reason,
                          "real": dom or None})
            flags.append({"rule": "lookalike_link", "severity": HIGH,
                          "title": "Link imitates a real site",
                          "why": f"{host} {reason}." + (f" The real site is {dom}." if dom else ""),
                          "match": host, "quote": host})
            continue
        if _site(host) in SHORTENERS:
            links.append({"host": host, "status": "shortener", "detail": "hides where it goes"})
            flags.append({"rule": "shortened_link", "severity": MEDIUM,
                          "title": "Shortened link hides the real address",
                          "why": f"{host} is a link shortener, so you can't see where it leads.",
                          "match": host, "quote": host})
            continue
        links.append({"host": host, "status": "unknown",
                      "detail": "not on any list we check; that doesn't make it safe"})
    return links, flags


# ---------------------------------------------------------------- blocklists

CACHE = Path(__file__).resolve().parent.parent / ".cache" / "blocklists"
MAX_AGE = 24 * 3600
SOURCES = {
    # name shown to users: (url, parser)
    "Phantom's blocklist": (
        "https://raw.githubusercontent.com/phantom/blocklist/master/blocklist.yaml", "yaml_urls"),
    "MetaMask's phishing list": (
        "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json",
        "metamask"),
    "ScamSniffer's database": (
        "https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/domains.json",
        "json_list"),
}


def _parse(kind: str, body: str) -> list[str]:
    if kind == "yaml_urls":
        return re.findall(r"^\s*-\s*url:\s*['\"]?([^'\"\s#]+)", body, re.M)
    data = json.loads(body)
    return data["blacklist"] if kind == "metamask" else data


class Blocklists:
    """Public phishing domain lists, downloaded at runtime and cached for a day.

    Not vendored: their licenses (none, custom, GPL) don't fit this MIT repo.
    """

    def __init__(self, sets: dict[str, set[str]] | None = None):
        self.sets = sets or {}
        self.missing: list[str] = []

    def lookup(self, host: str) -> str | None:
        parts = host.split(".")
        candidates = {".".join(parts[i:]) for i in range(len(parts) - 1)}
        for name, domains in self.sets.items():
            if candidates & domains:
                return name
        return None

    @classmethod
    def load(cls, client: httpx.Client | None = None) -> "Blocklists":
        CACHE.mkdir(parents=True, exist_ok=True)
        lists = cls()
        own = client is None
        client = client or httpx.Client(timeout=30, follow_redirects=True)
        try:
            for name, (url, kind) in SOURCES.items():
                path = CACHE / (re.sub(r"\W+", "_", name).strip("_").lower() + ".json")
                fresh = path.exists() and time.time() - path.stat().st_mtime < MAX_AGE
                domains = None
                if not fresh:
                    try:
                        r = client.get(url)
                        r.raise_for_status()
                        domains = [d.lower().strip() for d in _parse(kind, r.text)]
                        path.write_text(json.dumps(domains))
                    except (httpx.HTTPError, ValueError, KeyError):
                        domains = None  # fall back to a stale copy below
                if domains is None and path.exists():
                    domains = json.loads(path.read_text())
                if domains is None:
                    lists.missing.append(name)
                else:
                    lists.sets[name] = set(domains)
        finally:
            if own:
                client.close()
        return lists


_LISTS: Blocklists | None = None
_LOADED_AT = 0.0


def blocklists() -> Blocklists:
    global _LISTS, _LOADED_AT
    if _LISTS is None or time.time() - _LOADED_AT > MAX_AGE:
        _LISTS, _LOADED_AT = Blocklists.load(), time.time()
    return _LISTS


# ---------------------------------------------------------------- model

MODEL_PATH = Path(__file__).resolve().parent / "data" / "scam_model.json"
URL_RE = re.compile(r"https?://\S+|www\.\S+", re.I)  # same as scam/fetch_data.py
TOP_WORDS = 5
_MODEL: dict | None = None


def _model() -> dict:
    global _MODEL
    if _MODEL is None:
        _MODEL = json.loads(MODEL_PATH.read_text())
        _MODEL["_token_re"] = re.compile(_MODEL["token_pattern"])
    return _MODEL


def _ngrams(text: str, m: dict) -> list[str]:
    """Same features as sklearn's TfidfVectorizer with the exported settings."""
    text = re.sub(r"\s+", " ", URL_RE.sub("<URL>", text)).strip().lower()
    tokens = m["_token_re"].findall(text)
    lo, hi = m["ngram_range"]
    return [" ".join(tokens[i:i + n]) for n in range(lo, hi + 1)
            for i in range(len(tokens) - n + 1)]


def model_score(text: str) -> dict:
    m = _model()
    counts: dict[str, int] = {}
    for g in _ngrams(text, m):
        if g in m["terms"]:
            counts[g] = counts.get(g, 0) + 1
    weights = {}
    for g, c in counts.items():
        tf = 1 + math.log(c) if m["sublinear_tf"] else c
        weights[g] = tf * m["terms"][g][0]
    norm = math.sqrt(sum(w * w for w in weights.values())) or 1.0
    parts = {g: w / norm * m["terms"][g][1] for g, w in weights.items()}
    z = m["intercept"] + sum(parts.values())
    score = 1 / (1 + math.exp(-z))
    top = sorted((p for p in parts.items() if p[1] > 0), key=lambda p: -p[1])[:TOP_WORDS]
    return {
        "score": score,
        "score_pct": round(score * 100),
        "threshold": m["threshold"],
        "threshold_pct": round(m["threshold"] * 100),
        "flagged": score >= m["threshold"],
        # "url" is the <URL> placeholder: show it as what it stands for.
        "top_words": ["a link" if w == "url" else w for w, _ in top],
        "trained_on": m["trained_on"],
    }


# ---------------------------------------------------------------- verdict

def check_message(text: str, lists: Blocklists | None = None) -> dict:
    """Facts for one pasted message. No numbers or claims beyond what's quoted."""
    lists = lists if lists is not None else blocklists()
    flags = check_rules(text)
    links, link_flags = check_links(text, lists)
    flags += link_flags
    model = model_score(text)
    if model["flagged"]:
        words = ", ".join(f'"{w}"' for w in model["top_words"])
        flags.append({"rule": "model", "severity": MEDIUM,
                      "title": "Reads like known scam messages",
                      "why": f"A model trained on {model['trained_on']} labeled messages scored "
                             f"this {model['score_pct']}% (it flags from {model['threshold_pct']}%)."
                             + (f" Words that pushed it up: {words}." if words else ""),
                      "match": "", "quote": ""})
    if any(f["severity"] == HIGH for f in flags):
        verdict = "likely_scam"
    elif flags:
        verdict = "suspicious"
    else:
        verdict = "no_red_flags"
    return {
        "verdict": verdict,
        "red_flags": flags,
        "links": links,
        "model": {k: v for k, v in model.items() if k != "score"},
        "lists_checked": sorted(lists.sets),
        "lists_unavailable": lists.missing,
    }
