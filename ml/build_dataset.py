"""
PRIVISEE-X Dataset Builder
Builds a large labeled tracker dataset from public sources.

Sources:
  - EasyList        (advertising domains)
  - EasyPrivacy     (tracking/analytics domains)
  - Disconnect.me   (categorized tracker list)
  - DuckDuckGo Tracker Radar (prevalence + categories)
  - Tranco Top-1M   (benign baseline domains)

Output: ml/dataset_trackers.csv  (~15,000-30,000 labeled samples)
"""

import re
import io
import json
import math
import zipfile
import hashlib
import requests
import numpy as np
import pandas as pd
from tqdm import tqdm
from urllib.parse import urlparse
from collections import defaultdict

# ─── Source URLs ─────────────────────────────────────────────────────────────
SOURCES = {
    "easylist": "https://easylist.to/easylist/easylist.txt",
    "easyprivacy": "https://easylist.to/easylist/easyprivacy.txt",
    "disconnect": (
        "https://raw.githubusercontent.com/disconnectme/"
        "disconnect-tracking-protection/master/services.json"
    ),
    "duckduckgo": (
        "https://raw.githubusercontent.com/duckduckgo/tracker-radar/"
        "main/build-data/generated/domain_summary.json"
    ),
    "tranco": "https://tranco-list.eu/top-1m.csv.zip",
}

OUTPUT_PATH = "dataset_trackers.csv"

# Known tracking query parameters
TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "msclkid", "dclid", "yclid", "mc_cid", "mc_eid",
    "_ga", "ref", "affiliate_id", "click_id", "session_id", "visitor_id",
    "tracking_id", "ad_id", "campaign_id", "source", "medium",
}

# TLD scoring: 0=common(.com/.org), 1=country, 2=suspicious
TLD_MAP = {
    "com": 0, "org": 0, "net": 0, "edu": 0, "gov": 0,
    "io": 1, "co": 1, "me": 1, "app": 1,
    "xyz": 2, "top": 2, "click": 2, "link": 2, "info": 2,
}


# ─── Feature Engineering ─────────────────────────────────────────────────────

def shannon_entropy(s: str) -> float:
    """Calculate Shannon entropy of a string."""
    if not s:
        return 0.0
    freq = defaultdict(int)
    for c in s:
        freq[c] += 1
    n = len(s)
    return -sum((f / n) * math.log2(f / n) for f in freq.values())


def extract_features(domain: str, url: str = "", is_third_party: int = 1) -> dict:
    """
    Extract 13 features from a domain/URL.

    Returns a dict matching the feature schema used by the extension's
    trackerDetector.js module.
    """
    try:
        parsed = urlparse(url if url.startswith("http") else f"https://{domain}")
    except Exception:
        parsed = urlparse(f"https://{domain}")

    hostname = parsed.hostname or domain
    parts = hostname.split(".")
    tld = parts[-1].lower() if parts else "com"
    path = parsed.path or ""
    query = parsed.query or ""
    query_keys = set(re.split(r"[&=]", query)[::2]) if query else set()

    # Count digits and special chars in domain name
    domain_name = ".".join(parts[:-1]) if len(parts) > 1 else hostname
    digit_count = sum(c.isdigit() for c in domain_name)
    special_count = sum(not c.isalnum() and c != "." for c in domain_name)

    return {
        "domainLength": len(hostname),
        "subdomainCount": max(0, len(parts) - 2),
        "hasNumbers": int(any(c.isdigit() for c in hostname)),
        "tldType": TLD_MAP.get(tld, 1),
        "pathDepth": len([p for p in path.split("/") if p]),
        "queryParams": len(query_keys),
        "hasTrackingParams": int(bool(query_keys & TRACKING_PARAMS)),
        "isThirdParty": is_third_party,
        "resourceType": 0,  # unknown at dataset-build time
        "domainEntropy": round(shannon_entropy(hostname), 4),
        "tokenCount": len(re.split(r"[-_.]", domain_name)),
        "digitRatio": round(digit_count / max(len(domain_name), 1), 4),
        "specialCharRatio": round(special_count / max(len(domain_name), 1), 4),
    }


# ─── Source Loaders ──────────────────────────────────────────────────────────

def _get(url: str, timeout: int = 30) -> requests.Response:
    headers = {"User-Agent": "PRIVISEE-X Dataset Builder/1.0"}
    r = requests.get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    return r


def load_easylist(url: str, label: str) -> list[dict]:
    """Parse ABP/uBlock filter list and extract domains."""
    print(f"  Fetching {url} ...")
    try:
        text = _get(url).text
    except Exception as e:
        print(f"  ⚠ Failed: {e}")
        return []

    domains = set()
    # Match rules like ||domain.com^ or ||sub.domain.com^
    pattern = re.compile(r"\|\|([a-z0-9\-\.]+\.[a-z]{2,})\^")
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("!") or not line:
            continue
        m = pattern.match(line)
        if m:
            domains.add(m.group(1).lower())

    print(f"  → {len(domains):,} domains extracted")
    records = []
    for d in domains:
        feat = extract_features(d, is_third_party=1)
        feat["domain"] = d
        feat["label"] = label
        records.append(feat)
    return records


def load_disconnect(url: str) -> list[dict]:
    """Load Disconnect.me services.json — already categorized."""
    print(f"  Fetching {url} ...")
    try:
        data = _get(url).json()
    except Exception as e:
        print(f"  ⚠ Failed: {e}")
        return []

    # Map Disconnect categories to our labels
    cat_map = {
        "Advertising": "advertising",
        "Analytics": "analytics",
        "Social": "social",
        "Fingerprinting": "fingerprinting",
        "Content": "analytics",
        "Cryptomining": "fingerprinting",
    }

    records = []
    for category, companies in data.get("categories", {}).items():
        label = cat_map.get(category, "advertising")
        for company_dict in companies:
            for company_name, company_data in company_dict.items():
                for main_url, domains in company_data.items():
                    if isinstance(domains, list):
                        for d in domains:
                            d = d.lower().strip()
                            if d:
                                feat = extract_features(d, is_third_party=1)
                                feat["domain"] = d
                                feat["label"] = label
                                records.append(feat)

    print(f"  → {len(records):,} domains extracted")
    return records


def load_duckduckgo(url: str) -> list[dict]:
    """Load DuckDuckGo Tracker Radar domain summary."""
    print(f"  Fetching {url} ...")
    try:
        data = _get(url, timeout=60).json()
    except Exception as e:
        print(f"  ⚠ Failed: {e}")
        return []

    cat_map = {
        "Ad Motivated Tracking": "advertising",
        "Advertising": "advertising",
        "Analytics": "analytics",
        "Social Network": "social",
        "Social - Comment": "social",
        "Fingerprinting": "fingerprinting",
        "Badge": "social",
        "CDN": "benign",
        "Embedded Content": "analytics",
        "Session Replay": "fingerprinting",
        "Non-Tracking": "benign",
        "Unknown High Risk": "advertising",
    }

    records = []
    for domain, info in data.items():
        categories = info.get("categories", [])
        if not categories:
            continue
        # Use first category
        label = cat_map.get(categories[0], "advertising")
        d = domain.lower().strip()
        feat = extract_features(d, is_third_party=1)
        feat["domain"] = d
        feat["label"] = label
        records.append(feat)

    print(f"  → {len(records):,} domains extracted")
    return records


def load_tranco(url: str, limit: int = 10000) -> list[dict]:
    """Load Tranco top-1M list as benign domains."""
    print(f"  Fetching Tranco top-1M (this may take a moment) ...")
    try:
        r = _get(url, timeout=120)
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        csv_name = zf.namelist()[0]
        with zf.open(csv_name) as f:
            lines = f.read().decode("utf-8").splitlines()
    except Exception as e:
        print(f"  ⚠ Failed: {e}")
        # Fallback: hardcoded well-known benign domains
        return _fallback_benign_domains()

    records = []
    for line in lines[:limit]:
        parts = line.strip().split(",")
        if len(parts) < 2:
            continue
        d = parts[1].lower().strip()
        if not d or len(d) > 100:
            continue
        feat = extract_features(d, is_third_party=0)
        feat["domain"] = d
        feat["label"] = "benign"
        records.append(feat)

    print(f"  → {len(records):,} benign domains loaded")
    return records


def _fallback_benign_domains() -> list[dict]:
    """Fallback benign domains if Tranco download fails."""
    domains = [
        "google.com", "youtube.com", "wikipedia.org", "amazon.com",
        "reddit.com", "twitter.com", "instagram.com", "linkedin.com",
        "github.com", "stackoverflow.com", "bbc.com", "cnn.com",
        "nytimes.com", "theguardian.com", "apple.com", "microsoft.com",
        "netflix.com", "spotify.com", "airbnb.com", "uber.com",
        "dropbox.com", "slack.com", "zoom.us", "notion.so",
        "medium.com", "quora.com", "pinterest.com", "tumblr.com",
        "wordpress.com", "blogger.com", "wix.com", "squarespace.com",
        "shopify.com", "etsy.com", "ebay.com", "craigslist.org",
        "yelp.com", "tripadvisor.com", "booking.com", "expedia.com",
    ]
    records = []
    for d in domains:
        feat = extract_features(d, is_third_party=0)
        feat["domain"] = d
        feat["label"] = "benign"
        records.append(feat)
    print(f"  → {len(records):,} fallback benign domains loaded")
    return records


# ─── Main ─────────────────────────────────────────────────────────────────────

def build_dataset() -> pd.DataFrame:
    print("\n" + "=" * 60)
    print("PRIVISEE-X Dataset Builder")
    print("=" * 60)

    all_records: list[dict] = []

    print("\n[1/5] Loading EasyList (advertising)...")
    all_records.extend(load_easylist(SOURCES["easylist"], "advertising"))

    print("\n[2/5] Loading EasyPrivacy (analytics/tracking)...")
    all_records.extend(load_easylist(SOURCES["easyprivacy"], "analytics"))

    print("\n[3/5] Loading Disconnect.me (categorized)...")
    all_records.extend(load_disconnect(SOURCES["disconnect"]))

    print("\n[4/5] Loading DuckDuckGo Tracker Radar (categorized)...")
    all_records.extend(load_duckduckgo(SOURCES["duckduckgo"]))

    print("\n[5/5] Loading Tranco Top-1M (benign baseline)...")
    all_records.extend(load_tranco(SOURCES["tranco"], limit=10000))

    # Build DataFrame
    df = pd.DataFrame(all_records)

    # Deduplicate by domain — keep first occurrence (most specific label)
    df = df.drop_duplicates(subset=["domain"], keep="first")

    # Remove domains that appear in both tracker and benign lists
    tracker_domains = set(df[df["label"] != "benign"]["domain"])
    benign_domains = set(df[df["label"] == "benign"]["domain"])
    conflict = tracker_domains & benign_domains
    if conflict:
        # Prefer tracker label — remove benign rows for conflicting domains
        df = df[~((df["domain"].isin(conflict)) & (df["label"] == "benign"))]

    # Shuffle
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)

    # Print class distribution
    print("\n" + "=" * 60)
    print(f"Total samples: {len(df):,}")
    print("\nClass distribution:")
    dist = df["label"].value_counts()
    for label, count in dist.items():
        pct = count / len(df) * 100
        print(f"  {label:20} {count:6,}  ({pct:.1f}%)")

    # Save
    df.to_csv(OUTPUT_PATH, index=False)
    print(f"\n✓ Dataset saved to: {OUTPUT_PATH}")
    print("=" * 60)

    return df


if __name__ == "__main__":
    df = build_dataset()
    print(f"\nFeature columns: {[c for c in df.columns if c not in ('domain', 'label')]}")
    print("\nSample rows:")
    print(df.head(5).to_string())
