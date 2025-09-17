#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
SAT QuestionBank scraper (rich-content preserving)
- Saves raw HTML (stimulus/stem/choices/rationale)
- Extracts media (img/src/alt, inline SVG with aria-label, hidden long-descriptions)
- Keeps clean plaintext mirrors for search
- Caches detail responses to avoid refetching
- Optional CSV export with simple media flags
- Optional external image download (disabled by default)

Usage: python scrape_qbank.py
"""

import json, time, string, csv, random, os, re
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
import requests
from requests.adapters import HTTPAdapter, Retry
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

# ============================
# Config / Endpoints
# ============================
LIST_URL   = "https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital/get-questions"
DETAIL_URL = "https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital/get-question"

HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "origin": "https://satsuitequestionbank.collegeboard.org",
    "referer": "https://satsuitequestionbank.collegeboard.org/",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
}

# List payload – adjust as needed (R&W example: INI/CAS/EOI/SEC)
LIST_PAYLOAD      = {"asmtEventId": 99, "test": 1, "domain": "INI,CAS,EOI,SEC"}

# IO paths
RAW_LIST_JSON     = "questions.json"
NORMALIZED_JSON   = "qa_normalized.json"
NORMALIZED_CSV    = "qa_normalized.csv"
FAILURES_JSON     = "qa_failures.json"
CACHE_DIR         = Path(".cache_qbank")
MEDIA_DIR         = Path("media_qbank")

# Behavior
CHECKPOINT_EVERY  = 50
REQUEST_TIMEOUT_S = 75
DOWNLOAD_MEDIA    = False   # set True to download external images (http/https src)

CACHE_DIR.mkdir(exist_ok=True)
MEDIA_DIR.mkdir(exist_ok=True)

# ============================
# Helpers
# ============================

def build_session() -> requests.Session:
    s = requests.Session()
    retries = Retry(
        total=8, connect=5, read=5,
        backoff_factor=0.8,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["POST", "GET"],
        raise_on_status=False,
    )
    s.mount("https://", HTTPAdapter(max_retries=retries))
    s.mount("http://", HTTPAdapter(max_retries=retries))
    return s

def fetch_list() -> List[Dict[str, Any]]:
    if Path(RAW_LIST_JSON).exists():
        return json.load(open(RAW_LIST_JSON, "r", encoding="utf-8"))
    with build_session() as s:
        r = s.post(LIST_URL, headers=HEADERS, json=LIST_PAYLOAD, timeout=REQUEST_TIMEOUT_S)
        r.raise_for_status()
        data = r.json()
    if isinstance(data, list):
        records = data
    elif isinstance(data, dict):
        records = data.get("items") or data.get("data") or data.get("rows") or data.get("questions") or [data]
    else:
        raise TypeError(f"Unexpected list type: {type(data)}")
    json.dump(records, open(RAW_LIST_JSON, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    return records

def is_nosuchkey(obj: Any) -> bool:
    if not isinstance(obj, dict):
        return False
    if obj.get("name") == "NoSuchKey" or obj.get("Code") == "NoSuchKey":
        return True
    try:
        return "NoSuchKey" in json.dumps(obj, ensure_ascii=False)
    except Exception:
        return False

def fetch_detail_strong(session: requests.Session, external_id: str,
                        tries: int = 5, timeout: int = REQUEST_TIMEOUT_S) -> Optional[Dict[str, Any]]:
    payload = {"external_id": external_id}
    delay = 0.25
    for k in range(tries):
        try:
            time.sleep(0.05 + random.random() * 0.08)
            r = session.post(DETAIL_URL, headers=HEADERS, json=payload, timeout=timeout)
            if r.status_code in (429, 500, 502, 503, 504):
                raise requests.HTTPError(f"soft {r.status_code}", response=r)
            data = r.json()
            if is_nosuchkey(data):
                return None
            if any(key in data for key in ("answerOptions", "stem", "stimulus")):
                return data
            if k < tries - 1:
                time.sleep(delay + random.random() * 0.3)
                delay *= 2
                continue
            return None
        except (requests.ReadTimeout, requests.ConnectTimeout, requests.HTTPError, ValueError):
            if k == tries - 1:
                return None
            time.sleep(delay + random.random() * 0.3)
            delay *= 2
    return None

def cache_path(external_id: str) -> Path:
    return CACHE_DIR / f"{external_id}.json"

def get_detail_with_cache(session: requests.Session, external_id: str) -> Optional[Dict[str, Any]]:
    cp = cache_path(external_id)
    if cp.exists():
        return json.load(open(cp, "r", encoding="utf-8"))
    d = fetch_detail_strong(session, external_id)
    if not d:
        return None
    json.dump(d, open(cp, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    return d

def compact_text(s: str) -> str:
    return " ".join(s.split())

def html_to_plaintext_preserving_math_images(html: Optional[str]) -> str:
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")

    # Replace <img> with alt/label fallback
    for img in soup.find_all("img"):
        alt = img.get("alt") or img.get("aria-label") or "[image]"
        img.replace_with(alt)

    # Replace inline SVG with aria-label
    for svg in soup.find_all("svg"):
        label = svg.get("aria-label") or "[svg graphic]"
        svg.replace_with(label)

    # Include hidden long-description regions (often class=sr-only)
    for region in soup.find_all(attrs={"role": "region"}):
        cls = region.get("class") or []
        if "sr-only" in cls or region.get("aria-label"):
            region.replace_with(compact_text(region.get_text(" ", strip=True)))

    return compact_text(soup.get_text(" ", strip=True))

def is_data_url(u: str) -> bool:
    return u.startswith("data:")

def filename_from_url(u: str) -> str:
    parsed = urlparse(u)
    base = os.path.basename(parsed.path) or "image"
    if "." not in base:
        # guess from content-type later if needed
        return base
    return base

def download_image(session: requests.Session, src: str, dest_dir: Path) -> Optional[str]:
    if not src or is_data_url(src):
        return None
    try:
        r = session.get(src, headers=HEADERS, timeout=30)
        r.raise_for_status()
        name = filename_from_url(src)
        # Try to guess extension if missing
        if "." not in name:
            ctype = r.headers.get("content-type", "")
            ext = ".png"
            if "jpeg" in ctype:
                ext = ".jpg"
            elif "gif" in ctype:
                ext = ".gif"
            elif "svg" in ctype:
                ext = ".svg"
            name += ext
        out = dest_dir / name
        # avoid overwrite collisions
        stem, ext = os.path.splitext(name)
        k = 1
        while out.exists():
            out = dest_dir / f"{stem}_{k}{ext}"
            k += 1
        with open(out, "wb") as f:
            f.write(r.content)
        return str(out)
    except Exception:
        return None

def extract_media_from_html(html: Optional[str],
                            base_url: str = "https://satsuitequestionbank.collegeboard.org") -> List[Dict[str, Any]]:
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    media: List[Dict[str, Any]] = []

    # IMG
    for img in soup.find_all("img"):
        raw_src = img.get("src")
        src = urljoin(base_url, raw_src) if raw_src else None
        item = {
            "tag": "img",
            "src": src,
            "alt": img.get("alt") or "",
            "aria_label": img.get("aria-label") or "",
            "downloaded_path": None,
        }
        media.append(item)

    # SVG
    for svg in soup.find_all("svg"):
        media.append({
            "tag": "svg",
            "svg": str(svg),  # inline SVG markup
            "aria_label": svg.get("aria-label") or "",
            "role": svg.get("role") or "",
            "viewBox": svg.get("viewBox") or svg.get("viewbox") or "",
        })

    # FIGCAPTION
    for fig in soup.find_all("figure"):
        cap = fig.find("figcaption")
        if cap:
            media.append({
                "tag": "figcaption",
                "text": compact_text(cap.get_text(" ", strip=True)),
            })

    # Hidden long descriptions (sr-only regions with aria-label or role=region)
    for region in soup.find_all(attrs={"role": "region"}):
        cls = region.get("class") or []
        if "sr-only" in cls or region.get("aria-label"):
            media.append({
                "tag": "region",
                "aria_label": region.get("aria-label") or "",
                "text": compact_text(region.get_text(" ", strip=True)),
            })

    return media

def normalize_detail(detail: Dict[str, Any], meta: Dict[str, Any],
                     session_for_downloads: Optional[requests.Session] = None) -> Dict[str, Any]:
    # Raw HTML from API
    stimulus_html  = detail.get("stimulus") or ""
    stem_html      = detail.get("stem") or ""
    rationale_html = detail.get("rationale") or ""

    # Clean/plaintext mirrors (keep raw too)
    stimulus_text  = html_to_plaintext_preserving_math_images(stimulus_html)
    stem_text      = html_to_plaintext_preserving_math_images(stem_html)
    rationale_text = html_to_plaintext_preserving_math_images(rationale_html)

    # Correctness (letters and/or answer IDs)
    answer_letters = list(detail.get("correct_answer") or [])
    correct_ids    = list(detail.get("keys") or [])

    alpha = list(string.ascii_uppercase)
    choices_norm: List[Dict[str, Any]] = []
    for i, ch in enumerate(detail.get("answerOptions", []) or []):
        letter = alpha[i] if i < len(alpha) else None
        ch_html = ch.get("content") or ""
        ch_text = html_to_plaintext_preserving_math_images(ch_html)
        cid     = ch.get("id")
        is_ok   = (letter in answer_letters) or (cid in correct_ids)
        # Extract media per-choice
        ch_media = extract_media_from_html(ch_html)
        # Optionally download external images
        if DOWNLOAD_MEDIA and session_for_downloads:
            for m in ch_media:
                if m.get("tag") == "img" and m.get("src"):
                    m["downloaded_path"] = download_image(session_for_downloads, m["src"], MEDIA_DIR)

        choices_norm.append({
            "key": letter,
            "id": cid,
            "text": ch_text,
            "html": ch_html,
            "media": ch_media,
            "correct": bool(is_ok),
        })

    # Extract media from stimulus/stem/rationale
    stim_media = extract_media_from_html(stimulus_html)
    stem_media = extract_media_from_html(stem_html)
    rat_media  = extract_media_from_html(rationale_html)

    if DOWNLOAD_MEDIA and session_for_downloads:
        for m in stim_media:
            if m.get("tag") == "img" and m.get("src"):
                m["downloaded_path"] = download_image(session_for_downloads, m["src"], MEDIA_DIR)
        for m in stem_media:
            if m.get("tag") == "img" and m.get("src"):
                m["downloaded_path"] = download_image(session_for_downloads, m["src"], MEDIA_DIR)
        for m in rat_media:
            if m.get("tag") == "img" and m.get("src"):
                m["downloaded_path"] = download_image(session_for_downloads, m["src"], MEDIA_DIR)

    q_id = (
        detail.get("externalid")
        or meta.get("external_id")
        or meta.get("uId")
        or meta.get("questionId")
    )

    enriched = {
        "id": q_id,
        "external_id": meta.get("external_id"),
        "uId": meta.get("uId"),
        "questionId": meta.get("questionId"),
        "program": meta.get("program"),
        "domain": meta.get("primary_class_cd") or meta.get("domain"),
        "domain_desc": meta.get("primary_class_cd_desc") or meta.get("domain_desc"),
        "skill_cd": meta.get("skill_cd"),
        "skill_desc": meta.get("skill_desc"),
        "difficulty": meta.get("difficulty"),

        # Raw HTML + plaintext
        "stimulus_html": stimulus_html,
        "stimulus": stimulus_text,
        "stem_html": stem_html,
        "stem": stem_text,
        "rationale_html": rationale_html,
        "rationale": rationale_text,

        # Choices (each has text/html/media)
        "choices": choices_norm,

        # Correctness
        "correct_letters": sorted(answer_letters),
        "correct_ids": correct_ids,

        # Media buckets
        "media": {
            "stimulus": stim_media,
            "stem": stem_media,
            "rationale": rat_media
        },

        # Extra fields from detail if present
        "vaultid": detail.get("vaultid"),
        "origin": detail.get("origin"),
        "type": detail.get("type"),
        "templateclusterid": detail.get("templateclusterid"),
        "templateclustername": detail.get("templateclustername"),
        "parenttemplatename": detail.get("parenttemplatename"),
        "parenttemplateid": detail.get("parenttemplateid"),
        "position": detail.get("position"),
    }
    return enriched

def write_csv(rows: List[Dict[str, Any]], path: str):
    fields = [
        "id","external_id","uId","questionId","program","domain","domain_desc",
        "skill_cd","skill_desc","difficulty","stimulus","stem","choices_text",
        "correct_letters","rationale","has_img","has_svg","has_longdesc"
    ]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for q in rows:
            choices_text = " | ".join(f"{c['key']}. {c['text']}" for c in q.get("choices", []))
            media = (q.get("media") or {})
            stim_media = media.get("stimulus") or []
            has_img = any(m.get("tag") == "img" for m in stim_media)
            has_svg = any(m.get("tag") == "svg" for m in stim_media)
            has_long = any(m.get("tag") == "region" for m in stim_media)
            w.writerow({
                "id": q.get("id"),
                "external_id": q.get("external_id"),
                "uId": q.get("uId"),
                "questionId": q.get("questionId"),
                "program": q.get("program"),
                "domain": q.get("domain"),
                "domain_desc": q.get("domain_desc"),
                "skill_cd": q.get("skill_cd"),
                "skill_desc": q.get("skill_desc"),
                "difficulty": q.get("difficulty"),
                "stimulus": q.get("stimulus"),
                "stem": q.get("stem"),
                "choices_text": choices_text,
                "correct_letters": ",".join(q.get("correct_letters") or []),
                "rationale": q.get("rationale"),
                "has_img": int(has_img),
                "has_svg": int(has_svg),
                "has_longdesc": int(has_long),
            })

# ============================
# Main
# ============================

def main():
    records = fetch_list()
    print(f"List size: {len(records)}")

    normalized: List[Dict[str, Any]] = []
    seen_ids = set()
    if Path(NORMALIZED_JSON).exists():
        normalized = json.load(open(NORMALIZED_JSON, "r", encoding="utf-8"))
        for q in normalized:
            if q.get("external_id"):
                seen_ids.add(q["external_id"])
        print(f"Resuming: already have {len(normalized)} normalized items")

    failures: List[Tuple[str, str]] = []

    with build_session() as s:
        for i, meta in enumerate(records, 1):
            external_id = meta.get("external_id")
            if not external_id:
                failures.append(("missing_external_id", meta.get("questionId") or meta.get("uId") or "unknown"))
                continue
            if external_id in seen_ids:
                continue

            detail = get_detail_with_cache(s, external_id)
            if not detail:
                failures.append(("missing_or_timeout", external_id))
                print(f"[{i}/{len(records)}] missing/timeout for {external_id}")
                continue

            norm = normalize_detail(detail, meta, session_for_downloads=s if DOWNLOAD_MEDIA else None)
            normalized.append(norm)
            seen_ids.add(external_id)

            # preview first few
            if len(normalized) <= 3:
                print(f"\nQ{len(normalized)}: {norm['stem']}")
                for ch in norm["choices"]:
                    mark = "✓" if ch["correct"] else " "
                    print(f"  {ch['key']}. {ch['text']} {mark}")

            if len(normalized) % CHECKPOINT_EVERY == 0:
                json.dump(normalized, open(NORMALIZED_JSON, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
                print(f"[checkpoint] saved {len(normalized)} → {NORMALIZED_JSON}")

    # Save partial + failures
    json.dump(normalized, open(NORMALIZED_JSON, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    json.dump(failures, open(FAILURES_JSON, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"\nSaved {len(normalized)} items → {NORMALIZED_JSON}")
    if failures:
        print(f"Saved {len(failures)} failures → {FAILURES_JSON}")

    # Retry failures (optional)
    if failures:
        print("Retrying failures…")
        recovered = 0
        by_ext = {m.get("external_id"): m for m in records if m.get("external_id")}
        done = {q.get("external_id") for q in normalized if q.get("external_id")}
        todo = [ext for _, ext in failures if ext not in done]
        random.shuffle(todo)

        with build_session() as s:
            for idx, ext in enumerate(todo, 1):
                meta = by_ext.get(ext, {})
                d = fetch_detail_strong(s, ext, tries=6, timeout=90)
                if not d:
                    continue
                norm = normalize_detail(d, meta, session_for_downloads=s if DOWNLOAD_MEDIA else None)
                normalized.append(norm)
                recovered += 1
                if recovered % 20 == 0:
                    json.dump(normalized, open(NORMALIZED_JSON, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
                    print(f"[retry checkpoint] +{recovered}")

        json.dump(normalized, open(NORMALIZED_JSON, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        print(f"Recovered {recovered} items on retry; total now {len(normalized)}")

    # Optional CSV
    if NORMALIZED_CSV:
        write_csv(normalized, NORMALIZED_CSV)
        print(f"Wrote CSV → {NORMALIZED_CSV}")

if __name__ == "__main__":
    main()
