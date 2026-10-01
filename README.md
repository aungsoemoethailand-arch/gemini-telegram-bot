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
- `ADMIN_TELEGRAM_ID`: your numeric Telegram ID; send `/myid` to the bot to see it

## Run

```bash
python bot.py
```

The bot uses polling, so it is suitable for local testing. Use `/start` to begin and `/reset` to clear a user's conversation history.

## Access control and groups

- Only the admin ID and users added by the admin can use the bot.
- In groups, the bot replies only when mentioned, for example: `@YourBot မင်္ဂလာပါ`.
- In the bot's private chat, the admin can manage access:

```text
/allow 123456789
/allow @username
/remove 123456789
/remove @username
```

Use `/myid` to find a numeric Telegram ID. A username can be resolved after that user has sent a message to the bot; numeric IDs are the most reliable option. The current allowlist is held in memory and resets when the GitHub Actions runner restarts.

## Private-channel book catalog

Add the bot as an administrator in the private Telegram channel. New channel posts are indexed automatically. The bot stores the post text, author, book title, and the first URL it finds in a local SQLite catalog.

Authorized users can search from the bot DM with:

```text
/search စာအုပ်နာမည်
/search စာရေးသူ
```

Private-channel message links work for channel members. The current GitHub Actions runner has temporary storage, so the catalog is rebuilt only from posts received while that bot run is active; persistent history requires a database/host with persistent storage.

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
