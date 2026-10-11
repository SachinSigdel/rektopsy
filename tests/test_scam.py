"""Scam-check rules. Offline: blocklists are small in-memory sets.

The messages here were written by hand to pin down each rule; they are not an
accuracy measure (that comes from a held-out set of real reports).
"""

import pytest

from rektopsy.scam import Blocklists, check_message

LISTS = Blocklists({"Test list": {"drainer-claims.xyz"}})


def rules(text: str) -> set[str]:
    return {f["rule"] for f in check_message(text, LISTS)["red_flags"]}


@pytest.mark.parametrize("text, rule", [
    ("Hi, I'm from Phantom support. Please share your 12-word recovery phrase.", "secret_request"),
    ("Moderator here, give me the recovery phrase to restore your wallet.", "secret_request"),
    ("Just send your private key to set it up.", "secret_request"),
    ("Send 1 SOL to this address and get 2 SOL back instantly", "send_to_get_more"),
    ("Guaranteed 30% daily returns with my trading bot", "guaranteed_returns"),
    ("Sync your wallet here <URL>", "verify_wallet"),
    ("Free mint is live! Connect wallet and approve to claim <URL>", "wallet_to_claim"),
    ("We are migrating tokens to v2, sign the transaction at <URL> to keep your balance.", "wallet_to_claim"),
    ("I noticed your transaction failed. DM me", "unsolicited_help"),
    ("Your position is about to be liquidated", "fake_threat"),
    ("Unclaimed rewards detected in your wallet", "free_reward"),
    ("Only 500 spots left", "urgency"),
    ("Claim at https://phant0m-app.io/claim", "lookalike_link"),
    ("Swap with zero fees: jup1ter.ag", "lookalike_link"),
    ("Swap at raydlum.io", "lookalike_link"),
    ("Claim at https://www.drainer-claims.xyz/airdrop", "blocklisted_link"),
    ("Claim at https://app.drainer-claims.xyz", "blocklisted_link"),
    ("Details: bit.ly/3abcd", "shortened_link"),
    ("R\u0430ydium alpha program", "mixed_alphabets"),  # Cyrillic "а"
    ("claimdrop.xyz 🎁 1000 ZERO", "airdrop_link"),
    ("$ZERO AIRDROP", "free_reward"),
    ("Visit the site to use your whitelist right now.", "visit_to_claim"),
])
def test_rule_fires(text, rule):
    assert rule in rules(text)


@pytest.mark.parametrize("text", [
    "My swap on Jupiter failed with slippage error, what slippage should I use?",
    "Is it safe to connect Phantom to Raydium? First time using a DEX.",
    "Never share your seed phrase with anyone, admins will never DM you first.",
    "Don't ever give anyone your private key.",
    "How do I load a private key from a file in Rust?",
    "the staff here are so cringe",
    "Swapping on https://jup.ag and checking it on solscan.io",
    "Is the airdrop checker on jup.ag legit?",
    "Привет, как дела? Swap failed again",  # Russian and English words side by side is fine
])
def test_normal_messages_have_no_flags(text):
    assert check_message(text, LISTS)["verdict"] == "no_red_flags"


def test_verdicts_and_link_statuses():
    out = check_message("I'm from the Jupiter team, verify your wallet at jup1ter.ag or jup.ag", LISTS)
    assert out["verdict"] == "likely_scam"
    status = {link["host"]: link["status"] for link in out["links"]}
    assert status == {"jup1ter.ag": "lookalike", "jup.ag": "official"}
    assert check_message("Only 5 spots left", LISTS)["verdict"] == "suspicious"


def test_quotes_come_from_the_message():
    text = "Hello friend. Please share your seed phrase with me. Thanks!"
    flag = next(f for f in check_message(text, LISTS)["red_flags"] if f["rule"] == "secret_request")
    assert flag["quote"] == "Please share your seed phrase with me."
    assert text[flag["start"]:flag["end"]] == flag["match"]


def test_model_is_a_second_opinion():
    # No rule fires on this; the model flags it and names the words behind its score.
    out = check_message("WINNER!! Call now to collect your cash prize, reply YES", LISTS)
    assert [f["rule"] for f in out["red_flags"]] == ["model"]
    model_flag = out["red_flags"][0]
    assert out["verdict"] == "suspicious" and model_flag["severity"] == "medium"
    assert "prize" in out["model"]["top_words"]
    assert out["model"]["score_pct"] >= out["model"]["threshold_pct"]
    assert "score" not in out["model"]  # only rounded values reach the facts
