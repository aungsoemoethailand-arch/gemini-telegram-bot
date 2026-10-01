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
