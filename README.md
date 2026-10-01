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

## Run

```bash
python bot.py
```

The bot uses polling, so it is suitable for local testing. Use `/start` to begin and `/reset` to clear a user's conversation history.

## Groups and access

- Everyone can use the bot in private chat.
- In groups, the bot replies only when mentioned, for example: `@YourBot မင်္ဂလာပါ`.
- `/search`, `/ask`, and slash-title shortcuts are available to everyone in groups when sent as commands.

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

For a description/summary question, use `/ask` or mention the bot with the book name and question:

```text
/ask စာကျက်ချင်စိတ် ဒီစာအုပ်အကြောင်း အညွှန်းပြောပါ
@YourBot စာကျက်ချင်စိတ် ဒီစာအုပ်အကြောင်း ဘာလဲ
```

The answer is grounded in the matching channel post text. If the channel post contains only author/title/link, the bot can only report those fields and will say when there is not enough description to answer.

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
