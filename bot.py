import asyncio
import csv
import difflib
import hashlib
import html
import io
import json
import logging
import os
import re
import secrets
import sqlite3
import time
import urllib.request
import urllib.parse
import unicodedata
from html.parser import HTMLParser
from types import SimpleNamespace
from urllib.error import HTTPError
from collections import defaultdict

from dotenv import load_dotenv
from google import genai
from google.genai import types
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ChatAction, ChatType
from telegram.helpers import mention_html
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")
AI_HTTP_TIMEOUT = 15
def groq_key_number(name: str) -> int:
    suffix = name.removeprefix("GROQ_API_KEY")
    return int(suffix[1:]) if suffix.startswith("_") and suffix[1:].isdigit() else 0


GROQ_API_KEYS = [
    value.strip()
    for name, value in sorted(
        os.environ.items(),
        key=lambda item: groq_key_number(item[0]),
    )
    if (name == "GROQ_API_KEY" or re.fullmatch(r"GROQ_API_KEY_\d+", name)) and value.strip()
]
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "12"))
ADMIN_TELEGRAM_ID = int((os.getenv("ADMIN_TELEGRAM_ID", "0") or "0").strip())
BOOK_DB_PATH = os.getenv("BOOK_DB_PATH", "book_catalog.db")
BOOK_SEED_PATH = os.getenv("BOOK_SEED_PATH", "data/facebook_ai_books.csv")
REVIEW_SITE_BASE = "https://whispermmepub.github.io/Review/"

if not TELEGRAM_BOT_TOKEN:
    raise RuntimeError("TELEGRAM_BOT_TOKEN is missing. Add it to .env")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is missing. Add it to .env")

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

client = genai.Client(api_key=GEMINI_API_KEY)
user_history: dict[int, list[types.Content]] = defaultdict(list)
allowed_user_ids: set[int] = {ADMIN_TELEGRAM_ID} if ADMIN_TELEGRAM_ID else set()
known_usernames: dict[str, int] = {}
search_sessions: dict[str, dict[str, str]] = {}
review_cache: dict[str, object] = {"loaded_at": 0.0, "posts": []}

SYSTEM_INSTRUCTION = (
    "You are a warm, friendly Burmese-speaking female book assistant. "
    "Answer naturally and politely, like a helpful human assistant, without claiming to be a real human. "
    "Use short paragraphs, clear headings, and tasteful symbols when useful. "
    "You can understand and respond in Burmese, English, or the user's language."
)


def init_catalog() -> None:
    with sqlite3.connect(BOOK_DB_PATH) as db:
        db.execute(
            """CREATE TABLE IF NOT EXISTS books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL,
                message_id INTEGER NOT NULL,
                author TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL DEFAULT '',
                link TEXT NOT NULL DEFAULT '',
                raw_text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                record_no INTEGER NOT NULL DEFAULT 0,
                UNIQUE(chat_id, message_id, record_no)
            )"""
        )


def extract_book_fields(text: str) -> tuple[str, str, str]:
    """Extract author/title/link from common channel post formats."""
    link_match = re.search(r"https?://\S+", text)
    link = link_match.group(0).rstrip(")],။၊") if link_match else ""
    author = ""
    title = ""
    for line in text.splitlines():
        clean = line.strip()
        author_match = re.match(r"(?:စာရေးသူ|author)\s*[:：-]\s*(.+)", clean, re.I)
        title_match = re.match(r"(?:စာအုပ်နာမည်|စာအုပ်အမည်|title|book)\s*[:：-]\s*(.+)", clean, re.I)
        if author_match:
            author = author_match.group(1).strip()
        elif title_match:
            title = title_match.group(1).strip()
    if not author or not title:
        parts = re.split(r"\s*[-–—|]\s*", text.replace("\n", " "), maxsplit=2)
        if len(parts) >= 2:
            author = author or parts[0].strip()
            title = title or parts[1].strip()
    return author, title, link


def extract_book_records(text: str) -> list[tuple[str, str, str]]:
    """Parse CSV catalog posts or fall back to the single-book parser."""
    rows = list(csv.reader(io.StringIO(text)))
    if rows:
        header = [cell.strip().casefold() for cell in rows[0]]
        author_index = next((i for i, value in enumerate(header) if value in {"author", "စာရေးသူ"}), None)
        title_index = next((i for i, value in enumerate(header) if value in {"title", "book", "စာအုပ်နာမည်", "စာအုပ်အမည်"}), None)
        link_index = next((i for i, value in enumerate(header) if value in {"link", "url", "စာအုပ်လင့်", "လင့်"}), None)
        if author_index is not None and title_index is not None and link_index is not None:
            records = []
            for row in rows[1:]:
                if len(row) <= max(author_index, title_index, link_index):
                    continue
                author = row[author_index].strip()
                if author_index == 0 and title_index == 1 and link_index == 2 and len(row) > 3:
                    title = ",".join(row[1:-1]).strip()
                    link = row[-1].strip()
                else:
                    title = row[title_index].strip()
                    link = row[link_index].strip()
                if author or title or link:
                    records.append((author, title, link))
            if records:
                return records
    return [extract_book_fields(text)]


def extract_hashtag_review(text: str) -> tuple[str, str, str] | None:
    """Parse #bookreview #author #title posts and keep the full review text."""
    tags = re.findall(r"#([^\s#]+)", text)
    if not tags or not any(tag.casefold() in {"bookreview", "review", "စာအုပ်အညွှန်း"} for tag in tags):
        return None
    meaningful = [tag for tag in tags if tag.casefold() not in {"bookreview", "review", "စာအုပ်အညွှန်း"}]
    if not meaningful:
        return None
    author = meaningful[0] if len(meaningful) >= 2 else ""
    title = meaningful[1] if len(meaningful) >= 2 else meaningful[0]
    link_match = re.search(r"https?://\S+", text)
    link = link_match.group(0).rstrip(")],။၊") if link_match else ""
    return author, title, link


def message_link(chat_id: int, message_id: int) -> str:
    if str(chat_id).startswith("-100"):
        return f"https://t.me/c/{str(chat_id)[4:]}/{message_id}"
    return ""


def save_records(chat_id: int, message_id: int, records: list[tuple[str, str, str]], fallback_text: str = "") -> None:
    with sqlite3.connect(BOOK_DB_PATH) as db:
        for record_no, (author, title, link) in enumerate(records):
            link = link or message_link(chat_id, message_id)
            record_text = " - ".join(value for value in (author, title, link) if value)
            db.execute(
            """INSERT INTO books(chat_id, message_id, author, title, link, raw_text, created_at, record_no)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
               ON CONFLICT(chat_id, message_id, record_no) DO UPDATE SET
                 author=excluded.author, title=excluded.title, link=excluded.link,
                 raw_text=excluded.raw_text, record_no=excluded.record_no""",
            (chat_id, message_id, author, title, link,
             fallback_text if len(fallback_text) > len(record_text) else (record_text or fallback_text),
             record_no),
            )


def save_channel_post(message) -> None:
    text = (message.text or message.caption or "").strip()
    if text:
        hashtag_review = extract_hashtag_review(text)
        if hashtag_review:
            author, title, link = hashtag_review
            save_records(
                message.chat_id,
                message.message_id,
                [(author, title, link or message_link(message.chat_id, message.message_id))],
                text,
            )
            return
        save_records(
            message.chat_id,
            message.message_id,
            extract_book_records(text),
            text,
        )


def load_seed_catalog() -> int:
    if not os.path.exists(BOOK_SEED_PATH):
        logger.warning("Seed catalog not found at %s", BOOK_SEED_PATH)
        return 0
    with open(BOOK_SEED_PATH, encoding="utf-8-sig", newline="") as source:
        records = extract_book_records(source.read())
    save_records(0, 1, records, "seed catalog")
    return len(records)


def normalize_search_text(value: str) -> str:
    """Ignore Unicode spacing and common punctuation differences during search."""
    value = unicodedata.normalize("NFC", value or "").casefold()
    return re.sub(r"[\s\-–—_.,၊။:;!?()\[\]{}\"'`]+", "", value)


class ReviewBodyParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.depth = 0
        self.parts: list[str] = []
        self.block_tags = {"p", "div", "section", "article", "h1", "h2", "h3", "h4", "li", "blockquote"}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "div" and "post-body" in attrs.get("class", "").split():
            self.depth = 1
        elif self.depth:
            if tag == "br":
                self.parts.append("\n")
            elif tag in self.block_tags:
                self.parts.append("\n\n")
            self.depth += 1

    def handle_endtag(self, tag):
        if self.depth:
            if tag in self.block_tags:
                self.parts.append("\n\n")
            self.depth -= 1

    def handle_data(self, data):
        if self.depth:
            clean = re.sub(r"[ \t\u00a0]+", " ", data).strip()
            if clean:
                self.parts.append(clean)


def normalize_review_text(text: str) -> str:
    """Keep readable line/paragraph breaks without leaking HTML whitespace noise."""
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n").replace("\u00a0", " ")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    cleaned: list[str] = []
    for line in lines:
        if line:
            cleaned.append(line)
        elif cleaned and cleaned[-1] != "":
            cleaned.append("")
    while cleaned and cleaned[-1] == "":
        cleaned.pop()
    return "\n".join(cleaned)


def review_text_from_parser(parser: ReviewBodyParser) -> str:
    return normalize_review_text("".join(parser.parts))


def fetch_url(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "WoW-Book-Finder/1.0"})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", errors="replace")


def load_review_posts(force: bool = False) -> list[dict]:
    now = time.time()
    if not force and now - float(review_cache["loaded_at"]) < 600:
        return review_cache["posts"]  # type: ignore[return-value]
    try:
        posts = json.loads(fetch_url(REVIEW_SITE_BASE + "assets/posts.json"))
        review_cache.update({"loaded_at": now, "posts": posts})
        return posts
    except Exception:
        logger.exception("Unable to load review site index")
        return []


def sync_review_site() -> tuple[int, int]:
    """Refresh the public review index and add unseen review links to SQLite."""
    posts = load_review_posts(force=True)
    if not posts:
        return 0, 0
    source_chat_id = -2000000001
    with sqlite3.connect(BOOK_DB_PATH) as db:
        known_links = {
            row[0]
            for row in db.execute(
                "SELECT link FROM books WHERE chat_id = ? AND link != ?",
                (source_chat_id, ""),
            )
        }
    new_count = 0
    for post in posts:
        relative_link = str(post.get("link", "")).strip()
        if not relative_link:
            continue
        link = urllib.parse.urljoin(REVIEW_SITE_BASE, relative_link)
        author = str(post.get("author", "")).strip()
        title = str(post.get("title", "")).strip()
        record_id = int(hashlib.sha1(link.encode("utf-8")).hexdigest()[:12], 16)
        save_records(
            source_chat_id,
            record_id,
            [(author, title, link)],
            " - ".join(value for value in (author, title, link) if value),
        )
        if link not in known_links:
            new_count += 1
    return new_count, len(posts)


def review_matches(query: str, posts: list[dict]) -> list[tuple[str, str, str, str]]:
    normalized = normalize_search_text(clean_search_query(query))
    if not normalized:
        return []
    scored = []
    for post in posts:
        haystack = normalize_search_text(" ".join(str(post.get(k, "")) for k in ("title", "author", "excerpt")))
        score = 1.0 if normalized in haystack else difflib.SequenceMatcher(None, normalized, haystack[: max(len(normalized) * 3, 20)]).ratio()
        if score >= 0.38:
            scored.append((score, post))
    scored.sort(key=lambda item: item[0], reverse=True)
    matches = []
    for _, post in scored[:10]:
        try:
            detail_url = REVIEW_SITE_BASE + post["link"]
            parser = ReviewBodyParser()
            parser.feed(fetch_url(detail_url))
            review_text = review_text_from_parser(parser) or normalize_review_text(post.get("excerpt", ""))
        except Exception:
            review_text = normalize_review_text(post.get("excerpt", ""))
        matches.append((post.get("author", ""), post.get("title", ""), detail_url, review_text))
    return matches


def lookup_reviews(query: str) -> list[tuple[str, str, str, str]]:
    return review_matches(query, load_review_posts())


def clean_search_query(query: str) -> str:
    query = re.sub(r"(?:စာအုပ်တွေ|စာအုပ်များ|စာအုပ်|စာရင်း|ရှာပေးပါ|ရှာပေး|ရှာ)$", "", query.strip())
    return query.strip()


def search_catalog(query: str, limit: int | None = 10) -> list[tuple[str, str, str, str]]:
    query = clean_search_query(query)
    normalized_query = normalize_search_text(query)
    if not normalized_query:
        return []
    query_parts = [normalize_search_text(word) for word in re.split(r"\s+", query) if word]
    with sqlite3.connect(BOOK_DB_PATH) as db:
        rows = db.execute(
            "SELECT author, title, link, raw_text FROM books ORDER BY id DESC"
        ).fetchall()
    matches = []
    approximate = []
    for row in rows:
        haystack = normalize_search_text(" ".join(row))
        if normalized_query in haystack or all(part in haystack for part in query_parts):
            matches.append(row)
            if limit is not None and len(matches) >= limit:
                break
    if matches:
        return matches
    if len(normalized_query) < 3:
        return []
    for row in rows:
        author, title, link, raw_text = row
        candidates = [normalize_search_text(author), normalize_search_text(title)]
        score = max(difflib.SequenceMatcher(None, normalized_query, candidate).ratio() for candidate in candidates if candidate)
        if score >= 0.55:
            approximate.append((score, row))
    approximate.sort(key=lambda item: item[0], reverse=True)
    result = [row for _, row in approximate]
    return result if limit is None else result[:limit]


def find_catalog_mentions(text: str, limit: int = 5) -> list[tuple[str, str, str, str]]:
    """Find books whose title/author is explicitly mentioned in a question."""
    lowered = normalize_search_text(text)
    with sqlite3.connect(BOOK_DB_PATH) as db:
        rows = db.execute(
            "SELECT author, title, link, raw_text FROM books ORDER BY id DESC"
        ).fetchall()
    matches = []
    seen = set()
    for row in rows:
        author, title, link, raw_text = row
        if (title and normalize_search_text(title) in lowered) or (author and normalize_search_text(author) in lowered):
            key = (author, title, link)
            if key not in seen:
                matches.append(row)
                seen.add(key)
        if len(matches) >= limit:
            break
    return matches


def find_local_reviews(query: str) -> list[tuple[str, str, str, str]]:
    matches = find_catalog_mentions(query, limit=10)
    return [row for row in matches if "#bookreview" in row[3].casefold() or len(row[3]) > len(" - ".join(row[:3])) + 80]


def is_book_question(text: str) -> bool:
    markers = (
        "အကြောင်း", "အညွှန်း", "အကြောင်းအရာ", "အနှစ်ချုပ်", "အကျဉ်းချုပ်",
        "သုံးသပ်", "review", "summary", "about", "အခန်း", "ဘာသာပြန်",
    )
    lowered = normalize_search_text(text)
    return any(normalize_search_text(marker) in lowered for marker in markers)


def requester_mention(update: Update) -> str:
    user = update.effective_user
    return mention_html(user.id, user.full_name or "User")


def format_assistant_html(text: str) -> str:
    formatted = html.escape(text)
    formatted = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", formatted, flags=re.S)
    formatted = re.sub(r"`([^`]+)`", r"<code>\1</code>", formatted)
    return formatted


async def reply_with_mention(update: Update, text: str) -> None:
    await update.message.reply_text(
        f"{requester_mention(update)} {format_assistant_html(text)}",
        parse_mode="HTML",
    )


def search_query_from_text(text: str, bot_username: str = "") -> str:
    query = text.strip()
    if bot_username:
        query = re.sub(rf"@{re.escape(bot_username)}\b", "", query, flags=re.I)
    query = re.sub(r"^/search\b", "", query, flags=re.I).strip()
    query = re.sub(r"^/", "", query)
    query = re.sub(r"^(?:ရှာပေးပါ|ရှာပေး|ရှာ|find|search)\s*", "", query, flags=re.I)
    query = re.sub(r"\s*(?:ရှာပေးပါ|ရှာပေး|ရှာ|find|search)\s*$", "", query, flags=re.I)
    return query.strip(" \t:၊,။")


async def send_search_results(
    update: Update,
    results: list[tuple[str, str, str, str]],
    page: int = 0,
    search_query: str = "",
    session_token: str | None = None,
) -> None:
    page_size = 10
    page_count = max(1, (len(results) + page_size - 1) // page_size)
    page = max(0, min(page, page_count - 1))
    visible = results[page * page_size : (page + 1) * page_size]
    if search_query and session_token is None:
        session_token = secrets.token_urlsafe(6)
        search_sessions[session_token] = {
            "query": search_query,
            "mention": requester_mention(update),
        }
    lines = [f"<b>📚 ရှာဖွေမှုရလဒ် ({len(results)} ခု)</b>", f"စာမျက်နှာ {page + 1}/{page_count}"]
    buttons = []
    for index, (author, title, link, raw_text) in enumerate(visible, page * page_size + 1):
        display_title = title or raw_text.splitlines()[0][:120]
        lines.append(f"\n<b>{index}. {html.escape(display_title)}</b>")
        if author:
            lines.append(f"စာရေးသူ: {html.escape(author)}")
        if link:
            button_title = re.sub(r"\s+", " ", display_title).strip()[:48]
            buttons.append([InlineKeyboardButton(f"📖 {button_title}", url=link)])
    if session_token and page > 0:
        buttons.append([InlineKeyboardButton("⬅️ နောက်ပြန်", callback_data=f"bookpage:{session_token}:{page - 1}")])
    if session_token and page < page_count - 1:
        buttons.append([InlineKeyboardButton("ရှေ့ဆက် ➡️", callback_data=f"bookpage:{session_token}:{page + 1}")])
    markup = InlineKeyboardMarkup(buttons) if buttons else None
    text = f"{search_sessions.get(session_token, {}).get('mention', requester_mention(update))} " + "\n".join(lines)
    if update.callback_query:
        await update.callback_query.message.edit_text(text, parse_mode="HTML", reply_markup=markup)
    else:
        await update.message.reply_text(text, parse_mode="HTML", reply_markup=markup)


async def handle_search_page(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    try:
        _, token, page_text = query.data.split(":", 2)
        page = int(page_text)
        session = search_sessions.get(token)
        if not session:
            await query.answer("ဒီရှာဖွေမှု session သက်တမ်းကုန်သွားပါပြီ။ ပြန်ရှာပါ။", show_alert=True)
            return
        results = search_catalog(session["query"], limit=None)
        await send_search_results(update, results, page=page, search_query=session["query"], session_token=token)
    except (ValueError, IndexError):
        await query.answer("ရှာဖွေမှု page မမှန်ပါ။", show_alert=True)


async def answer_from_catalog(update: Update, question: str, results: list[tuple[str, str, str, str]]) -> None:
    lines = ["<b>📖 Channel ထဲက မူရင်းအညွှန်း</b>"]
    buttons = []
    for author, title, link, raw_text in results[:5]:
        display_title = title or "စာအုပ်အမည် မသိရသေးပါ"
        lines.append(f"\n<b>{html.escape(display_title)}</b>")
        if author:
            lines.append(f"စာရေးသူ: {html.escape(author)}")
        review_text = normalize_review_text(raw_text)[:3500]
        lines.append(html.escape(review_text))
        if link:
            button_title = re.sub(r"\s+", " ", display_title).strip()[:48]
            buttons.append([InlineKeyboardButton(f"📖 {button_title}", url=link)])
    await update.message.reply_text(
        f"{requester_mention(update)} " + "\n".join(lines),
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(buttons) if buttons else None,
    )


def split_message(text: str, limit: int = 4096) -> list[str]:
    """Split long Gemini replies into Telegram-safe chunks."""
    if len(text) <= limit:
        return [text]
    chunks = []
    while text:
        cut = min(limit, len(text))
        if cut < len(text):
            newline = text.rfind("\n", 0, cut)
            space = text.rfind(" ", 0, cut)
            cut = max(newline, space, 1)
        chunks.append(text[:cut].strip())
        text = text[cut:].lstrip()
    return chunks


async def generate_with_retry(contents: list[types.Content]):
    """Use at most one short Gemini retry; quota errors go straight to fallback."""
    for attempt in range(2):
        try:
            return await asyncio.to_thread(
                client.models.generate_content,
                model=GEMINI_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    temperature=0.7,
                ),
            )
        except Exception as exc:
            error_text = str(exc)
            transient = any(
                marker in error_text
                for marker in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED")
            )
            if "429" in error_text or "RESOURCE_EXHAUSTED" in error_text:
                raise
            if not transient or attempt == 1:
                raise
            delay = 1
            logger.warning(
                "Temporary Gemini failure; retrying in %ss (attempt %s/3): %s",
                delay,
                attempt + 1,
                type(exc).__name__,
            )
            await asyncio.sleep(delay)


def groq_generate(api_key: str, contents: list[types.Content]):
    messages = [{"role": "system", "content": SYSTEM_INSTRUCTION}]
    for content in contents:
        text = "\n".join(part.text for part in (content.parts or []) if part.text)
        if text:
            messages.append({"role": "assistant" if content.role == "model" else "user", "content": text})
    payload = json.dumps({
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": 0.7,
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "WoW-Book-Finder/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=AI_HTTP_TIMEOUT) as response:
        data = json.loads(response.read().decode("utf-8"))
    text = data["choices"][0]["message"]["content"]
    return SimpleNamespace(text=text)


def compatible_generate(api_key: str, endpoint: str, model: str, contents: list[types.Content], extra_headers: dict[str, str] | None = None):
    messages = [{"role": "system", "content": SYSTEM_INSTRUCTION}]
    for content in contents:
        text = "\n".join(part.text for part in (content.parts or []) if part.text)
        if text:
            messages.append({"role": "assistant" if content.role == "model" else "user", "content": text})
    payload = json.dumps({
        "model": model,
        "messages": messages,
        "temperature": 0.7,
    }).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "WoW-Book-Finder/1.0",
    }
    headers.update(extra_headers or {})
    request = urllib.request.Request(
        endpoint,
        data=payload,
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=AI_HTTP_TIMEOUT) as response:
        data = json.loads(response.read().decode("utf-8"))
    return SimpleNamespace(text=data["choices"][0]["message"]["content"])


def openai_generate(contents: list[types.Content]):
    return compatible_generate(OPENAI_API_KEY, "https://api.openai.com/v1/chat/completions", OPENAI_MODEL, contents)


def deepseek_generate(contents: list[types.Content]):
    return compatible_generate(DEEPSEEK_API_KEY, "https://api.deepseek.com/chat/completions", DEEPSEEK_MODEL, contents)


def openrouter_generate(contents: list[types.Content]):
    return compatible_generate(
        OPENROUTER_API_KEY,
        "https://openrouter.ai/api/v1/chat/completions",
        OPENROUTER_MODEL,
        contents,
        {"HTTP-Referer": "https://github.com/aungsoemoethailand-arch/gemini-telegram-bot", "X-Title": "WoW Book Finder"},
    )


async def generate_with_fallback(contents: list[types.Content]):
    try:
        return await generate_with_retry(contents)
    except Exception as gemini_error:
        logger.warning("Gemini failed (%s); trying Groq key pool", type(gemini_error).__name__)
        last_error = gemini_error
        failures = [f"Gemini:{provider_error_label(gemini_error)}"]
        for index, api_key in enumerate(GROQ_API_KEYS, 1):
            try:
                logger.info("Trying Groq fallback key slot %s/%s", index, len(GROQ_API_KEYS))
                return await asyncio.to_thread(groq_generate, api_key, contents)
            except Exception as groq_error:
                last_error = groq_error
                failures.append(f"Groq{index}:{provider_error_label(groq_error)}")
                logger.warning("Groq key slot %s failed: %s", index, type(groq_error).__name__)
        if OPENAI_API_KEY:
            try:
                logger.info("Trying OpenAI fallback model %s", OPENAI_MODEL)
                return await asyncio.to_thread(openai_generate, contents)
            except Exception as openai_error:
                last_error = openai_error
                failures.append(f"OpenAI:{provider_error_label(openai_error)}")
                logger.warning("OpenAI fallback failed: %s", type(openai_error).__name__)
        for label, api_key, generator in (
            ("DeepSeek", DEEPSEEK_API_KEY, deepseek_generate),
            ("OpenRouter", OPENROUTER_API_KEY, openrouter_generate),
        ):
            if not api_key:
                continue
            try:
                logger.info("Trying %s fallback", label)
                return await asyncio.to_thread(generator, contents)
            except Exception as provider_error:
                last_error = provider_error
                failures.append(f"{label}:{provider_error_label(provider_error)}")
                logger.warning("%s fallback failed: %s", label, type(provider_error).__name__)
        setattr(last_error, "provider_failures", ", ".join(failures))
        raise last_error


def provider_error_label(error: Exception) -> str:
    if isinstance(error, HTTPError):
        return f"HTTP {error.code}"
    text = str(error)
    for marker in ("401", "403", "429", "500", "502", "503"):
        if marker in text:
            return marker
    return type(error).__name__


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "<b>မင်္ဂလာပါရှင် 📚✨</b>\n\n"
        "စာအုပ်ရှာပေးတာ၊ မူရင်းအညွှန်းဖတ်ပေးတာနဲ့ AI မေးခွန်းတွေကို ကူညီပေးပါမယ်နော် 💜\n\n"
        "အောက်က menu ကနေ ရွေးနိုင်ပါတယ်ရှင်။",
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("📚 စာအုပ်ရှာမယ်", callback_data="menu:search"),
             InlineKeyboardButton("📝 အညွှန်းဖတ်မယ်", callback_data="menu:ask")],
            [InlineKeyboardButton("❓ အသုံးပြုပုံ", callback_data="menu:help")],
        ]),
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "<b>📚 အသုံးပြုပုံလေးပါရှင်</b>\n\n"
        "<b>စာအုပ် link ရှာရန်</b>\n/search စာအုပ်နာမည် သို့မဟုတ် စာရေးသူ\n\n"
        "<b>မူရင်းအညွှန်းဖတ်ရန်</b>\n/ask စာအုပ်နာမည်\n\n"
        "Group ထဲမှာတော့ @YourBot နဲ့ mention လုပ်ပြီး မေးလို့ရပါတယ်ရှင် 💜",
        parse_mode="HTML",
    )


async def update_reviews(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.chat.send_action(ChatAction.TYPING)
    try:
        new_count, total_count = await asyncio.to_thread(sync_review_site)
        await reply_with_mention(
            update,
            f"Review site ကို စစ်ပြီးပါပြီရှင် 📚\n"
            f"အသစ်တွေ့ပြီး catalog ထဲ ထည့်ထားတာ: {new_count} ခု\n"
            f"Review စုစုပေါင်း: {total_count} ခု\n\n"
            "အသစ်တင်ထားတဲ့စာအုပ်ကို အခုချက်ချင်း /search သို့မဟုတ် /ask နဲ့ ရှာလို့ရပါပြီရှင်။",
        )
    except Exception:
        logger.exception("Review site update failed")
        await reply_with_mention(update, "Review site ကို update လုပ်ရာမှာ အခက်အခဲရှိပါတယ်ရှင်။ ခဏနောက် ပြန်စမ်းပါနော်။")


async def handle_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    action = query.data.split(":", 1)[1]
    messages = {
        "search": "📚 <b>စာအုပ်ရှာမယ်</b>\n\n/search စာအုပ်နာမည် သို့မဟုတ် စာရေးသူ လို့ ရိုက်ပို့ပါရှင်။",
        "ask": "📝 <b>မူရင်းအညွှန်းဖတ်မယ်</b>\n\n/ask စာအုပ်နာမည် လို့ ရိုက်ပို့ပါရှင်။ Channel ထဲက အညွှန်းစာသားကို တိုက်ရိုက်ပြပေးပါမယ်။",
        "help": "❓ <b>အကူအညီ</b>\n\n/search နဲ့ စာအုပ်ရှာပါ။\n/ask နဲ့ မူရင်းအညွှန်းဖတ်ပါ။\n/reset နဲ့ စကားဝိုင်းအသစ်စပါ။",
    }
    await query.message.reply_text(messages.get(action, messages["help"]), parse_mode="HTML")


async def my_id(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show the sender's numeric Telegram ID for admin setup."""
    user = update.effective_user
    username = f"@{user.username}" if user.username else "(no username)"
    await update.message.reply_text(f"Your Telegram ID: {user.id}\nUsername: {username}")


def remember_user(update: Update) -> None:
    user = update.effective_user
    if user and user.username:
        known_usernames[user.username.casefold()] = user.id


def is_admin(user_id: int) -> bool:
    return bool(ADMIN_TELEGRAM_ID and user_id == ADMIN_TELEGRAM_ID)


def parse_target_id(value: str) -> int | None:
    value = value.strip()
    if value.startswith("@"):
        return known_usernames.get(value[1:].casefold())
    try:
        return int(value)
    except ValueError:
        return None


async def allow_user(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.effective_user.id
    if update.effective_chat.type != ChatType.PRIVATE or not is_admin(user_id):
        await update.message.reply_text("ဒီ command ကို admin က bot DM မှာပဲ သုံးနိုင်ပါတယ်။")
        return
    if not context.args:
        await update.message.reply_text("သုံးပုံ: /allow <Telegram ID> သို့မဟုတ် /allow @username")
        return
    target = parse_target_id(context.args[0])
    if target is None:
        await update.message.reply_text(
            "ဒီ username ကို မတွေ့ပါ။ User က bot ကိုအရင် message ပို့စေပြီး /allow @username ပြန်လုပ်ပါ၊ "
            "သို့မဟုတ် numeric Telegram ID သုံးပါ။"
        )
        return
    allowed_user_ids.add(target)
    await update.message.reply_text(f"Allowed user: {target}")


async def remove_user(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.effective_user.id
    if update.effective_chat.type != ChatType.PRIVATE or not is_admin(user_id):
        await update.message.reply_text("ဒီ command ကို admin က bot DM မှာပဲ သုံးနိုင်ပါတယ်။")
        return
    if not context.args:
        await update.message.reply_text("သုံးပုံ: /remove <Telegram ID> သို့မဟုတ် /remove @username")
        return
    target = parse_target_id(context.args[0])
    if target is None:
        await update.message.reply_text("User မတွေ့ပါ။ Numeric Telegram ID သုံးပါ။")
        return
    if target == ADMIN_TELEGRAM_ID:
        await update.message.reply_text("Admin ကို remove လုပ်လို့မရပါ။")
        return
    allowed_user_ids.discard(target)
    await update.message.reply_text(f"Removed user: {target}")


async def search_books(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = " ".join(context.args).strip()
    if not query:
        await update.message.reply_text("သုံးပုံ: /search စာရေးသူ သို့မဟုတ် စာအုပ်နာမည်")
        return
    results = search_catalog(query, limit=None)
    if not results:
        await reply_with_mention(update, "ထည့်သွင်းထားတဲ့ catalog ထဲမှာ မတွေ့ပါ။")
        return
    await send_search_results(update, results, search_query=query)


async def ask_books(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.effective_user.id
    question = " ".join(context.args).strip()
    local_reviews = find_local_reviews(question)
    review_results = await asyncio.to_thread(lookup_reviews, question)
    results = local_reviews or review_results or find_catalog_mentions(question) or search_catalog(question)
    if not question or not results:
        await reply_with_mention(update, "စာအုပ်နာမည်ပါအောင် မေးပါ။ ဥပမာ /ask စာအုပ်နာမည် အကြောင်းအရာ ဘာလဲ")
        return
    try:
        await answer_from_catalog(update, question, results)
    except Exception as exc:
        logger.exception("Catalog answer failed for user %s", user_id)
        await reply_with_mention(
            update,
            "Channel အညွှန်းကို ဖတ်ရာမှာ ယာယီအခက်အခဲရှိလို့ စာအုပ်အချက်အလက်ကို ပြပေးထားပါတယ်ရှင်။"
        )
        await send_search_results(update, results, search_query=question)


async def short_search(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Support /author-or-title as a quick group search shortcut."""
    query = search_query_from_text(update.message.text[1:])
    if not query:
        await reply_with_mention(update, "သုံးပုံ: /စာရေးသူ သို့မဟုတ် /စာအုပ်နာမည်")
        return
    results = search_catalog(query, limit=None)
    if results:
        await send_search_results(update, results, search_query=query)
    else:
        await reply_with_mention(update, "ထည့်သွင်းထားတဲ့ catalog ထဲမှာ မတွေ့ပါ။")


async def handle_channel_post(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.channel_post
    if not message:
        return
    if message.document and (message.document.file_name or "").lower().endswith(".csv"):
        telegram_file = await context.bot.get_file(message.document.file_id)
        data = await telegram_file.download_as_bytearray()
        text = bytes(data).decode("utf-8-sig")
        records = extract_book_records(text)
        save_records(message.chat_id, message.message_id, records, text)
        logger.info("Imported %s CSV records from channel document %s", len(records), message.message_id)
        return
    save_channel_post(message)
    logger.info("Indexed channel post %s from chat %s", message.message_id, message.chat_id)


async def reset(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_history.pop(update.effective_user.id, None)
    await update.message.reply_text("စကားဝိုင်းမှတ်တမ်းကို ဖျက်ပြီးပါပြီ။")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message or not update.message.text:
        return

    user_id = update.effective_user.id
    remember_user(update)

    is_group = update.effective_chat.type in (ChatType.GROUP, ChatType.SUPERGROUP)
    bot_username = (context.bot.username or "").casefold()
    mentioned = bot_username and f"@{bot_username}" in update.message.text.casefold()
    if is_group and not mentioned:
        return
    prompt = update.message.text.strip()
    if not prompt:
        return

    catalog_query = search_query_from_text(prompt, bot_username)
    local_reviews = find_local_reviews(prompt)
    mentioned_books = local_reviews
    if not mentioned_books and is_book_question(prompt):
        mentioned_books = await asyncio.to_thread(lookup_reviews, prompt)
    mentioned_books = mentioned_books or find_catalog_mentions(prompt)
    if is_book_question(prompt) and mentioned_books:
        try:
            await answer_from_catalog(update, prompt, mentioned_books)
        except Exception as exc:
            logger.exception("Catalog answer failed for user %s", user_id)
            await reply_with_mention(
                update,
                "Channel အညွှန်းကို ဖတ်ရာမှာ ယာယီအခက်အခဲရှိလို့ စာအုပ်အချက်အလက်ကို ပြပေးထားပါတယ်ရှင်။"
            )
            await send_search_results(update, mentioned_books, search_query=prompt)
        return
    catalog_results = search_catalog(catalog_query, limit=None) if catalog_query else []
    if catalog_results:
        await send_search_results(update, catalog_results, search_query=catalog_query)
        return

    # AI general Q&A is intentionally paused for now. Keep this handler focused
    # on fast book search/review lookups until AI is explicitly enabled again.
    await reply_with_mention(
        update,
        "လောလောဆယ် စာအုပ်ရှာဖွေခြင်းနဲ့ စာအုပ်အညွှန်းကိုပဲ အမြန်ဆုံး ကူညီပေးနေပါတယ်ရှင်။\n"
        "/search စာအုပ်နာမည် သို့မဟုတ် /ask စာအုပ်နာမည် လို့ မေးနိုင်ပါတယ်။",
    )


def main() -> None:
    init_catalog()
    logger.info("Loaded %s seed catalog records", load_seed_catalog())
    logger.info("Configured Groq fallback key slots: %s", len(GROQ_API_KEYS))
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("update", update_reviews))
    application.add_handler(CommandHandler("myid", my_id))
    application.add_handler(CommandHandler("search", search_books))
    application.add_handler(CommandHandler("ask", ask_books))
    application.add_handler(CallbackQueryHandler(handle_search_page, pattern=r"^bookpage:"))
    application.add_handler(CallbackQueryHandler(handle_menu, pattern=r"^menu:"))
    application.add_handler(MessageHandler(filters.UpdateType.CHANNEL_POSTS, handle_channel_post))
    application.add_handler(CommandHandler("reset", reset))
    application.add_handler(
        MessageHandler(
            filters.TEXT & filters.Regex(r"^/(?!start\b|help\b|update\b|myid\b|allow\b|remove\b|search\b|ask\b|reset\b)\S+.*$"),
            short_search,
        )
    )
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info("Bot started with model %s", GEMINI_MODEL)
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
