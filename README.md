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
- Search replies use bold titles, a friendly assistant tone, and tappable book-link buttons.
- Search is Unicode-normalized and ignores extra/missing spaces and common punctuation differences.
- Large result sets show 10 books per page with Previous/Next buttons; approximate spelling matches are returned when an exact match is not found.

The current UI trial adds a friendly welcome menu with `📚 စာအုပ်ရှာမယ်`, `📝 အညွှန်းဖတ်မယ်`, and `❓ အသုံးပြုပုံ` buttons, plus `/help`. This is a single reversible commit so it can be rolled back if the style is not preferred.

## AI fallback

For normal AI questions, the bot uses this automatic order: **Gemini → Groq key pool → ChatGPT/OpenAI**. If Gemini returns a quota/rate-limit or temporary capacity error, it tries the Groq keys; if those also fail, it tries OpenAI. The Groq fallback uses `llama-3.1-8b-instant` by default. Add `OPENAI_API_KEY` as a GitHub repository secret for the final fallback. The default OpenAI model is `gpt-4o-mini`; an OpenAI `429` means that key has no usable quota/billing capacity and cannot be fixed by the bot code.

Add one or more Groq secrets named `GROQ_API_KEY`, `GROQ_API_KEY_2`, `GROQ_API_KEY_3`, and so on up to `_10`. The bot uses them in numeric order and automatically tries the next key if a Groq key fails. Use underscores only; names such as `GROQ_API_KEY-3,4` are not supported. Leaving optional fallback secrets empty simply skips that provider.

## Uptime

The current deployment uses GitHub Actions. A run can stay alive for up to 350 minutes, and a scheduled workflow attempts to restart it every 5 hours. This is not a guaranteed 24/7 service: GitHub runner startup delays, cancellation delays, or quota limits can create downtime. For reliable always-on operation, move the bot to a persistent VPS or hosting service.

## Private-channel book catalog

Add the bot as an administrator in the private Telegram channel. New channel posts are indexed automatically. The bot stores the post text, author, book title, and the first URL it finds in a local SQLite catalog.

Authorized users can search from the bot DM with:

```text
/search စာအုပ်နာမည်
/search စာရေးသူ
```

In groups, authorized users can search in any of these ways:

```text
/search စာအုပ်နာမည်
@YourBot စာအုပ်နာမည်
/စာအုပ်နာမည်
```

The bot searches the channel catalog first, and replies by mentioning the user who asked. If an `@YourBot ...` query has no catalog match, it is handled as a normal Gemini question.

Channel posts support two separate modes:

1. Link catalog: `စာရေးသူ - စာအုပ်နာမည် - စာအုပ်လင့်`
2. Original review text: start the post with hashtags such as `#bookreview #သစ်စိုး #ပဉ္စလက်ကကြိုး`, then write the full annotation/review below. `/ask ပဉ္စလက်ကကြိုး` returns this Channel review text directly.

Channel reviews are checked before the public website, so your own newly posted annotation is the source used for answers. The public Review site/GitHub-generated index remains a fallback for reviews that have not yet been posted into the Channel.

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
