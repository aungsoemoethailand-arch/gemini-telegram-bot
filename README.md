# Gemini Telegram Bot

Python Telegram bot that sends user messages to Gemini and keeps a short per-user conversation history.

## Security first

The Telegram token previously pasted in chat is considered exposed. Revoke it in `@BotFather` and create a new token. Do not commit tokens or API keys.

## Setup

```bash
cd gemini-telegram-bot
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and set:

- `TELEGRAM_BOT_TOKEN`: a newly generated token from `@BotFather`
- `GEMINI_API_KEY`: a key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- `GROQ_API_KEY`: optional fallback key from [Groq Console](https://console.groq.com/keys)

## Run

```bash
python bot.py
```

The bot uses polling, so it is suitable for local testing. Use `/start` to begin and `/reset` to clear a user's conversation history.

## Groups and access

- Everyone can use the bot in private chat.
- In groups, the bot replies only when mentioned, for example: `@YourBot မင်္ဂလာပါ`.
- `/search`, `/ask`, and slash-title shortcuts are available to everyone in groups when sent as commands.
- In DM, a plain book title or author can be sent without `/search`.
- In groups, a plain book title or author also searches the catalog without `/search`; the bot replies only when a match is found.
- Annotation lookup remains `/ask စာအုပ်နာမည်` in both DM and groups.
- `/search` and plain title/author searches show book-link records only; review/annotation records are intentionally excluded and appear only through `/ask`.
- Search replies use bold titles, a friendly assistant tone, and tappable book-link buttons.
- Search is Unicode-normalized and ignores extra/missing spaces and common punctuation differences.
- Large result sets show 10 books per page with Previous/Next buttons; approximate spelling matches are returned when an exact match is not found.

The current UI trial adds a friendly welcome menu with `📚 စာအုပ်ရှာမယ်`, `📝 အညွှန်းဖတ်မယ်`, and `❓ အသုံးပြုပုံ` buttons, plus `/help`. This is a single reversible commit so it can be rolled back if the style is not preferred.

## AI fallback (temporarily paused)

For normal AI questions, the bot uses this automatic order: **Gemini → Groq key pool → OpenAI → DeepSeek → OpenRouter free router**. If a provider returns a quota/rate-limit, capacity, or model error, it moves to the next configured provider. The Groq fallback uses `llama-3.1-8b-instant` by default. Add optional GitHub repository secrets named `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, and `OPENROUTER_API_KEY`. OpenRouter uses `openrouter/free` by default, which selects an available free model; free routers can still have temporary limits.

Quota errors now skip Gemini's long retry delay and move to the next provider immediately; temporary 503 errors get only one short retry. Provider HTTP timeouts are capped at 15 seconds to keep replies responsive.

General AI question answering is currently paused to prioritize fast and reliable book search and annotation lookup. `/search`, `/ask`, channel indexing, public review lookup, pagination, and book-link buttons remain enabled. AI fallback code is retained so it can be enabled again later.

Add one or more Groq secrets named `GROQ_API_KEY`, `GROQ_API_KEY_2`, `GROQ_API_KEY_3`, and so on up to `_10`. The bot uses them in numeric order and automatically tries the next key if a Groq key fails. Use underscores only; names such as `GROQ_API_KEY-3,4` are not supported. Leaving optional fallback secrets empty simply skips that provider.

## Uptime

The current deployment uses GitHub Actions. A run can stay alive for up to 350 minutes, and a scheduled workflow attempts to restart it every 5 hours. This is not a guaranteed 24/7 service: GitHub runner startup delays, cancellation delays, or quota limits can create downtime. For reliable always-on operation, move the bot to a persistent VPS or hosting service.

The workflow is tuned for minimum downtime: it starts at minute 5 every six hours, runs for 355 minutes, automatically restarts `bot.py` if the polling process exits, and dispatches a recovery run after an early scheduled/manual failure. GitHub-hosted runners still have a six-hour job limit, so this remains near-24/7 rather than guaranteed 24/7 hosting.

## Group message auto-delete

Following the reference Group Guardian Bot's safe cleanup policy:

- Only group/supergroup command messages are deleted; ordinary member messages are never deleted.
- Group command messages are deleted after `COMMAND_AUTO_DELETE_SECONDS` (default: 30 seconds).
- Bot replies/results sent shortly after a group command are deleted after `AUTO_DELETE_MINUTES` (default: 3 minutes).
- Bot DM messages are never auto-deleted.
- Set `AUTO_DELETE_ENABLED=0` to disable all automatic cleanup, or `AUTO_DELETE_MINUTES=0` to keep bot results while still removing group commands.

## Private-channel book catalog

Add the bot as an administrator in the private Telegram channel. New channel posts are indexed automatically. The bot stores the post text, author, book title, and the first URL it finds in a local SQLite catalog.

Authorized users can search from the bot DM with:

```text
/search စာအုပ်နာမည်
/search စာရေးသူ
```

စာရင်းအပြည့်အစုံကြည့်ရန်:

```text
/authors
/books
```

`/authors` က စာရေးသူတစ်ယောက်ချင်းစီ၏ စာအုပ်အရေအတွက်ကို ပြပေးသည်။
`/books` က စာအုပ်တစ်အုပ်ချင်းစီအတွက် ဖတ်ရန် link ခလုတ်ပါ ထည့်ပေးသည်။
`/stats` က စာအုပ်စုစုပေါင်း၊ စာရေးသူစုစုပေါင်းနှင့် စာအုပ်အများဆုံးရှိသော စာရေးသူများကို ပြပေးသည်။
စာရင်းနှစ်ခုလုံးကို Telegram message limit မကျော်အောင် စာမျက်နှာခွဲပြီး
Previous/Next ခလုတ်များဖြင့် ပြပေးသည်။

In groups, authorized users can search in any of these ways:

```text
/search စာအုပ်နာမည်
@YourBot စာအုပ်နာမည်
/စာအုပ်နာမည်
```

The bot searches the channel catalog first, and replies by mentioning the user who asked. If an `@YourBot ...` query has no catalog match, it returns a short book-search usage message while general AI mode is paused.

Channel posts support two separate modes:

1. Link catalog: `စာရေးသူ - စာအုပ်နာမည် - စာအုပ်လင့်`
2. Original review text: start the post with hashtags such as `#bookreview #သစ်စိုး #ပဉ္စလက်ကကြိုး`, then write the full annotation/review below. `/ask ပဉ္စလက်ကကြိုး` returns this Channel review text directly.

Channel reviews are checked before the public website, so your own newly posted annotation is the source used for answers. The public Review site/GitHub-generated index remains a fallback for reviews that have not yet been posted into the Channel.

To manually check for new reviews from the public site, send:

```text
/update
```

The bot force-refreshes `https://whispermmepub.github.io/Review/`, adds unseen review links to the catalog, removes older duplicate channel reposts with the same author/title while keeping the newest entry, and reports the counts. After that, use `/search` or `/ask` normally.

For the original annotation posted in the Channel, use `/ask` or mention the bot with the book name:

```text
/ask စာကျက်ချင်စိတ် ဒီစာအုပ်အကြောင်း အညွှန်းပြောပါ
@YourBot စာကျက်ချင်စိတ် ဒီစာအုပ်အကြောင်း ဘာလဲ
```

`/ask` returns the original Channel post/annotation directly; it does not ask Gemini and does not invent a summary. If the matching post contains only author/title/link, those are the fields returned.

The bot also checks the public review index at `https://whispermmepub.github.io/Review/`. For example:

```text
/ask ပဉ္စလက်ကကြိုး
```

returns the original review text from the matching review detail page, together with author/title and a button linking to that review. The review index is refreshed at most every 10 minutes and the first lookup may take a few seconds while the detail page is fetched. New Channel text posts and CSV documents continue to be indexed immediately when Telegram delivers them.

Private-channel message links work for channel members. Text posts are indexed as soon as Telegram delivers the update, normally within a few seconds. CSV documents uploaded to the channel are downloaded and imported automatically. The committed seed CSV is loaded during startup, so these books are searchable immediately after the bot starts.

The current GitHub Actions runner has temporary storage. New channel data remains available while that run is active; the committed seed catalog is reloaded after a restart. Persistent additions require a database/host with persistent storage.

Multiple books can be posted as CSV in one message:

```csv
author,title,link
"Tsumiki","စာကျက်ချင်စိတ်","https://t.me/TheBookR/967?single"
"ကက်စပါဇော်","ပျော်ရွှင်ဖို့ လိုအပ်တဲ့ သတ္တိ","https://t.me/TheBookR/1250?single"
```

The simpler one-book format also works:

```text
စာရေးသူ - စာအုပ်နာမည် - စာအုပ်လင့်
```

## GitHub

```bash
git init
git add bot.py requirements.txt .env.example .gitignore README.md
git commit -m "Create Gemini Telegram bot"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

`.env` is ignored and will not be uploaded.
