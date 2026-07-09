"""
Current Affairs Engine
======================
Fetches, categorizes, and caches current affairs news + hometown intelligence
for IIM interview questioning.

Sources:
  - RSS feeds from major Indian news outlets (no API key required)
  - Wikipedia REST API for city/hometown facts
  - DuckDuckGo search for political representatives and local context

Cache:
  - In-memory dict (_news_cache / _hometown_cache)
  - Persisted to data/.tmp/current_affairs_cache.json and hometown_cache.json
  - News auto-refreshes every 6 hours via background asyncio task
"""

import asyncio
import json
import logging
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import feedparser
import httpx
from duckduckgo_search import DDGS

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths & constants
# ---------------------------------------------------------------------------

TMP_DIR = Path("data") / ".tmp"
CACHE_FILE = TMP_DIR / "current_affairs_cache.json"
HOMETOWN_CACHE_FILE = TMP_DIR / "hometown_cache.json"
CALIBRATION_HOURS = 6

TMP_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# RSS feed sources (all free, no API key)
# ---------------------------------------------------------------------------

RSS_FEEDS = {
    "google_india": "https://news.google.com/rss/search?q=India+news&hl=en-IN&gl=IN&ceid=IN:en",
    "hindu_national": "https://www.thehindu.com/news/national/?service=rss",
    "indian_express": "https://indianexpress.com/section/india/feed/",
    "toi_top": "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms",
    "ht_india": "http://feeds.hindustantimes.com/HT-India",
}

# ---------------------------------------------------------------------------
# News categories for keyword-based classification
# ---------------------------------------------------------------------------

NEWS_CATEGORIES = {
    "economy": [
        "gdp", "inflation", "rbi", "repo rate", "budget", "fiscal", "tax",
        "gst", "stock", "market", "trade", "export", "import", "growth",
        "recession", "unemployment",
    ],
    "geopolitics": [
        "china", "pakistan", "russia", "ukraine", "gaza", "israel", "brics",
        "quad", "g20", "nato", "sanctions", "diplomat", "foreign policy",
        "border", "war",
    ],
    "technology": [
        "ai", "artificial intelligence", "startup", "tech", "digital",
        "cyber", "semiconductor", "ev", "electric vehicle", "upi", "5g",
        "blockchain",
    ],
    "social_policy": [
        "education", "nep", "reservation", "healthcare", "poverty",
        "welfare", "labour", "women", "caste", "religion", "constitution",
    ],
    "environment": [
        "climate", "pollution", "renewable", "solar", "carbon", "flood",
        "drought", "environment", "green", "sustainable",
    ],
    "sports": [
        "cricket", "ipl", "olympics", "hockey", "football", "badminton",
        "tennis", "athlete", "medal", "world cup",
    ],
}

# ---------------------------------------------------------------------------
# Static fallback topics (used when live feeds are unavailable)
# ---------------------------------------------------------------------------

STATIC_HOT_TOPICS = [
    "India's fiscal deficit and budget management in 2025-26",
    "AI regulation and its impact on Indian IT industry",
    "India's stance in the evolving global order (BRICS, Quad, G20)",
    "Climate change commitments and renewable energy transition",
    "UPI and India's digital payments revolution",
    "Russia-Ukraine conflict implications for India",
    "Israel-Palestine situation and India's diplomatic stance",
    "US-China trade tensions and impact on Indian exports",
    "Startup ecosystem valuation corrections in India",
    "New Education Policy (NEP) implementation challenges",
    "India's semiconductor manufacturing ambitions",
    "Quick commerce disruption in Indian retail",
    "Digital rupee (CBDC) pilot and banking implications",
    "India's defence modernization and indigenous manufacturing",
    "Gig economy regulation and worker rights",
]

# ---------------------------------------------------------------------------
# Module-level caches
# ---------------------------------------------------------------------------

_news_cache: dict = {}
_hometown_cache: dict = {}

# ---------------------------------------------------------------------------
# Cache persistence helpers
# ---------------------------------------------------------------------------


def _load_cache(filepath: Path = CACHE_FILE) -> dict | None:
    """Load cached data from a JSON file, or return None if unavailable."""
    try:
        if filepath.exists():
            with open(filepath, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            logger.info("Loaded cache from %s", filepath)
            return data
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to load cache %s: %s", filepath, exc)
    return None


def _save_cache(data: dict, filepath: Path = CACHE_FILE) -> None:
    """Persist cache dict to a JSON file."""
    try:
        filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2, default=str)
        logger.info("Saved cache to %s", filepath)
    except OSError as exc:
        logger.warning("Failed to save cache %s: %s", filepath, exc)


# ---------------------------------------------------------------------------
# Headline categorization
# ---------------------------------------------------------------------------


def _categorize_headline(title: str, summary: str = "") -> str:
    """
    Categorise a headline into one of NEWS_CATEGORIES keys using
    simple keyword matching on the combined title + summary text.

    Returns the best-matching category or 'general' if nothing matches.
    """
    text = f"{title} {summary}".lower()

    best_category = "general"
    best_score = 0

    for category, keywords in NEWS_CATEGORIES.items():
        score = sum(1 for kw in keywords if kw in text)
        if score > best_score:
            best_score = score
            best_category = category

    return best_category


# ---------------------------------------------------------------------------
# RSS fetching
# ---------------------------------------------------------------------------


async def fetch_and_cache_news() -> dict:
    """
    Fetch headlines from all RSS feeds with a fallback chain.
    If one feed fails, log a warning and continue to the next.

    Each headline is categorised and stored.  The result is cached both
    in-memory and to disk.

    Returns
    -------
    dict
        {
            "fetched_at": <ISO timestamp>,
            "headlines": [{"title", "category", "source", "date", "summary"}, …],
            "hot_topics": [str, …],
        }
    """
    global _news_cache  # noqa: PLW0603

    headlines: list[dict] = []

    for source_name, url in RSS_FEEDS.items():
        try:
            # feedparser is sync; run in executor to avoid blocking the loop
            loop = asyncio.get_running_loop()
            feed = await loop.run_in_executor(None, feedparser.parse, url)

            if feed.bozo and not feed.entries:
                logger.warning("Feed %s returned bozo with no entries", source_name)
                continue

            for entry in feed.entries:
                title = entry.get("title", "").strip()
                summary = entry.get("summary", "").strip()
                published = entry.get("published", "")

                if not title:
                    continue

                headlines.append(
                    {
                        "title": title,
                        "category": _categorize_headline(title, summary),
                        "source": source_name,
                        "date": published,
                        "summary": summary[:300],  # truncate long summaries
                    }
                )

            logger.info(
                "Fetched %d entries from %s", len(feed.entries), source_name
            )

        except Exception as exc:
            logger.warning("Failed to fetch feed %s: %s", source_name, exc)
            continue

    # Deduplicate by title (keep first occurrence)
    seen_titles: set[str] = set()
    unique_headlines: list[dict] = []
    for hl in headlines:
        normalised = hl["title"].lower().strip()
        if normalised not in seen_titles:
            seen_titles.add(normalised)
            unique_headlines.append(hl)
    headlines = unique_headlines

    # Build hot topics: most-represented categories × top headlines
    hot_topics = _extract_hot_topics(headlines)

    cache_data = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "headlines": headlines,
        "hot_topics": hot_topics,
    }

    _news_cache = cache_data
    _save_cache(cache_data, CACHE_FILE)

    logger.info(
        "News cache refreshed: %d headlines, %d hot topics",
        len(headlines),
        len(hot_topics),
    )
    return cache_data


def _extract_hot_topics(headlines: list[dict], n: int = 15) -> list[str]:
    """
    Derive hot-topic titles from the fetched headlines.

    Strategy: pick the top *n* headlines that belong to the most frequent
    categories (so current-affairs heavy categories get more representation).
    Falls back to STATIC_HOT_TOPICS when no headlines are available.
    """
    if not headlines:
        return STATIC_HOT_TOPICS[:n]

    # Count category frequency
    cat_counts: dict[str, int] = {}
    for hl in headlines:
        cat = hl["category"]
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    # Sort headlines: higher-frequency categories first, then by position
    sorted_hl = sorted(
        headlines,
        key=lambda h: (-cat_counts.get(h["category"], 0),),
    )

    topics: list[str] = []
    seen: set[str] = set()
    for hl in sorted_hl:
        if hl["title"] not in seen:
            topics.append(hl["title"])
            seen.add(hl["title"])
        if len(topics) >= n:
            break

    return topics if topics else STATIC_HOT_TOPICS[:n]


# ---------------------------------------------------------------------------
# Headline retrieval (from cache)
# ---------------------------------------------------------------------------


def _ensure_cache_loaded() -> dict:
    """Make sure _news_cache is populated (from memory or disk)."""
    global _news_cache  # noqa: PLW0603

    if _news_cache:
        return _news_cache

    disk_data = _load_cache(CACHE_FILE)
    if disk_data:
        _news_cache = disk_data
        return _news_cache

    # Nothing available – return a shell with static fallback
    _news_cache = {
        "fetched_at": None,
        "headlines": [],
        "hot_topics": STATIC_HOT_TOPICS,
    }
    return _news_cache


def get_relevant_headlines(
    interests: list[str],
    state: str = "",
    n: int = 10,
) -> list[dict]:
    """
    Filter cached headlines by the candidate's declared interests and
    optionally their home state.

    Parameters
    ----------
    interests : list[str]
        E.g. ["economy", "technology", "geopolitics"]
    state : str, optional
        Candidate's home state for regional relevance.
    n : int
        Max headlines to return.

    Returns
    -------
    list[dict]
        Each dict has: title, category, source, date, summary.
    """
    cache = _ensure_cache_loaded()
    headlines = cache.get("headlines", [])

    if not headlines:
        return []

    # Map interest labels to category keys
    interest_lower = {i.lower() for i in interests}
    # Also map common interest names to category keys
    interest_to_cat = {
        "finance": "economy",
        "economics": "economy",
        "economy_finance": "economy",
        "technology_ai": "technology",
        "ai": "technology",
        "social_issues": "social_policy",
        "defence_security": "geopolitics",
        "defence": "geopolitics",
        "startups_entrepreneurship": "technology",
        "startups": "technology",
        "healthcare": "social_policy",
        "science_space": "technology",
        "history_heritage": "social_policy",
        "arts_literature": "general",
    }

    target_cats: set[str] = set()
    for interest in interest_lower:
        if interest in NEWS_CATEGORIES:
            target_cats.add(interest)
        elif interest in interest_to_cat:
            target_cats.add(interest_to_cat[interest])

    state_lower = state.lower().strip()

    def relevance_score(hl: dict) -> int:
        score = 0
        if hl["category"] in target_cats:
            score += 10
        if state_lower and state_lower in (hl["title"] + hl.get("summary", "")).lower():
            score += 5
        # Boost headlines whose text contains any interest keyword
        text = (hl["title"] + " " + hl.get("summary", "")).lower()
        for interest in interest_lower:
            if interest in text:
                score += 3
        return score

    scored = [(relevance_score(hl), hl) for hl in headlines]
    scored.sort(key=lambda x: -x[0])

    # Return top-n that have at least *some* relevance; fall back to top-n by position
    relevant = [hl for score, hl in scored if score > 0]
    if not relevant:
        relevant = headlines

    return relevant[:n]


def get_hot_topics(n: int = 5) -> list[str]:
    """Return top *n* trending topic titles for general grilling."""
    cache = _ensure_cache_loaded()
    topics = cache.get("hot_topics", STATIC_HOT_TOPICS)
    return topics[:n]


# ---------------------------------------------------------------------------
# Hometown / city context
# ---------------------------------------------------------------------------


def _search_ddg(query: str, max_results: int = 5) -> list[dict]:
    """Run a DuckDuckGo text search synchronously. Returns list of result dicts."""
    try:
        with DDGS(timeout=5) as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
            return results
    except Exception as exc:
        logger.warning("DuckDuckGo search failed for '%s': %s", query, exc)
        return []


async def get_hometown_context(city: str, state: str) -> dict:
    """
    Build a fact-file for a candidate's hometown by combining:
      1. Wikipedia REST API  – city overview, landmarks, population
      2. DuckDuckGo searches – political reps, industries, state leaders

    Parameters
    ----------
    city : str
        Candidate's city / town.
    state : str
        Candidate's state.

    Returns
    -------
    dict
        Keys: city, state, cm, governor, mp, mla, major_industries,
              famous_landmarks, recent_local_news, population, key_facts.
    """
    global _hometown_cache  # noqa: PLW0603

    cache_key = f"{city.lower().strip()}|{state.lower().strip()}"

    # Check in-memory cache first
    if cache_key in _hometown_cache:
        logger.info("Hometown context for %s (cache hit)", city)
        return _hometown_cache[cache_key]

    # Check disk cache
    if not _hometown_cache:
        disk = _load_cache(HOMETOWN_CACHE_FILE)
        if disk and isinstance(disk, dict):
            _hometown_cache = disk

    if cache_key in _hometown_cache:
        return _hometown_cache[cache_key]

    # --- 1. Wikipedia API for city overview ---
    wiki_data = await _fetch_wikipedia_summary(city)

    # --- 2-4. DuckDuckGo searches (sync, run in executor) ---
    loop = asyncio.get_running_loop()

    political_results, industry_results, state_leader_results = await asyncio.gather(
        loop.run_in_executor(
            None, _search_ddg, f"{city} current MLA MP 2025", 5
        ),
        loop.run_in_executor(
            None, _search_ddg, f"{city} major industries economy", 5
        ),
        loop.run_in_executor(
            None, _search_ddg, f"{state} chief minister governor 2025", 5
        ),
    )

    # Also grab recent local news
    local_news_results = await loop.run_in_executor(
        None, _search_ddg, f"{city} {state} latest news 2025", 5
    )

    # --- Build the context dict ---
    context = {
        "city": city,
        "state": state,
        "cm": _extract_field(state_leader_results, "chief minister"),
        "governor": _extract_field(state_leader_results, "governor"),
        "mp": _extract_field(political_results, "mp"),
        "mla": _extract_field(political_results, "mla"),
        "major_industries": _extract_snippet(industry_results),
        "famous_landmarks": wiki_data.get("landmarks", ""),
        "recent_local_news": [
            r.get("title", "") for r in local_news_results[:5] if r.get("title")
        ],
        "population": wiki_data.get("population", ""),
        "key_facts": wiki_data.get("extract", ""),
    }

    # Cache
    _hometown_cache[cache_key] = context
    _save_cache(_hometown_cache, HOMETOWN_CACHE_FILE)

    logger.info("Built hometown context for %s, %s", city, state)
    return context


async def _fetch_wikipedia_summary(city_name: str) -> dict:
    """
    Fetch the Wikipedia summary for a city using the free REST API.

    Returns a dict with keys: extract, population, landmarks.
    """
    result: dict = {"extract": "", "population": "", "landmarks": ""}

    # Normalise city name for URL (replace spaces with underscores)
    url_city = city_name.strip().replace(" ", "_")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://en.wikipedia.org/api/rest_v1/page/summary/{url_city}"
            )
            if resp.status_code == 200:
                data = resp.json()
                extract = data.get("extract", "")
                result["extract"] = extract[:1000]  # truncate

                # Attempt to pull population from the extract text
                pop_match = re.search(
                    r"population[^\d]*?([\d,]+(?:\.\d+)?(?:\s*(?:million|lakh|crore))?)",
                    extract,
                    re.IGNORECASE,
                )
                if pop_match:
                    result["population"] = pop_match.group(1).strip()

                # Landmarks: look for sentences mentioning "temple", "fort", etc.
                landmark_keywords = [
                    "temple", "fort", "palace", "lake", "museum",
                    "monument", "park", "church", "mosque", "university",
                ]
                sentences = extract.split(".")
                landmarks = [
                    s.strip()
                    for s in sentences
                    if any(kw in s.lower() for kw in landmark_keywords)
                ]
                result["landmarks"] = ". ".join(landmarks[:3])
            else:
                logger.warning(
                    "Wikipedia API returned %d for '%s'",
                    resp.status_code,
                    city_name,
                )
    except Exception as exc:
        logger.warning("Wikipedia API failed for '%s': %s", city_name, exc)

    return result


# ---------------------------------------------------------------------------
# DuckDuckGo result extraction helpers
# ---------------------------------------------------------------------------


def _extract_field(results: list[dict], field_hint: str) -> str:
    """
    Attempt to extract a specific field (e.g. 'chief minister') from
    DuckDuckGo result snippets.  Returns the best snippet or empty string.
    """
    for r in results:
        body = r.get("body", "") or r.get("title", "")
        if field_hint.lower() in body.lower():
            # Return the sentence containing the hint
            for sentence in body.split("."):
                if field_hint.lower() in sentence.lower():
                    return sentence.strip()
    return ""


def _extract_snippet(results: list[dict]) -> str:
    """Concatenate the first few result bodies into a summary snippet."""
    snippets = []
    for r in results[:3]:
        body = r.get("body", "")
        if body:
            snippets.append(body.strip())
    return " | ".join(snippets)[:500]


# ---------------------------------------------------------------------------
# Dynamic IIM CA Scraper
# ---------------------------------------------------------------------------

async def get_iim_ca_questions(interests: list[str]) -> list[str]:
    """
    Dynamically scrape DuckDuckGo for recent real-world interview questions
    related to the candidate's interests to inject into the deep-grilling prompt.
    """
    if not interests:
        return []

    loop = asyncio.get_running_loop()
    all_questions = []

    for interest in interests:
        query = f"IIM interview questions on {interest} current affairs 2024 2025"
        try:
            results = await loop.run_in_executor(None, _search_ddg, query, 5)
            # Try to extract questions ending in '?'
            for r in results:
                body = r.get("body", "")
                if "?" in body:
                    sentences = [s.strip() + "?" for s in body.split("?") if s.strip()]
                    all_questions.extend(sentences)
        except Exception as exc:
            logger.warning(f"Failed to scrape IIM questions for {interest}: {exc}")
    
    # Deduplicate and return top 5
    unique = list(dict.fromkeys(all_questions))
    return unique[:5]


# ---------------------------------------------------------------------------
# Background refresh loop
# ---------------------------------------------------------------------------


async def start_news_refresh_loop() -> None:
    """
    Background asyncio task that refreshes news every CALIBRATION_HOURS.

    Call this once at application startup:
        asyncio.create_task(start_news_refresh_loop())
    """
    logger.info(
        "Starting news refresh loop (every %d hours)", CALIBRATION_HOURS
    )

    while True:
        try:
            await fetch_and_cache_news()
            logger.info("News refresh complete. Next in %dh.", CALIBRATION_HOURS)
        except Exception as exc:
            logger.error("News refresh failed: %s", exc, exc_info=True)

        await asyncio.sleep(CALIBRATION_HOURS * 3600)
