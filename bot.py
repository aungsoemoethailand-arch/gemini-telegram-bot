import logging
import os
from collections import defaultdict

from dotenv import load_dotenv
from google import genai
from google.genai import types
from telegram import Update
from telegram.constants import ChatAction
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "12"))

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

SYSTEM_INSTRUCTION = (
    "You are a helpful Telegram assistant. Answer clearly and concisely. "
    "You can understand and respond in Burmese, English, or the user's language."
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


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "မင်္ဂလာပါ။ Gemini AI Bot ဖြစ်ပါတယ်။\n"
        "မေးချင်တာကို စာရိုက်ပို့ပါ။ စကားဝိုင်းအသစ်စရန် /reset ကိုသုံးပါ။"
    )


async def reset(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_history.pop(update.effective_user.id, None)
    await update.message.reply_text("စကားဝိုင်းမှတ်တမ်းကို ဖျက်ပြီးပါပြီ။")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message or not update.message.text:
        return

    user_id = update.effective_user.id
    prompt = update.message.text.strip()
    if not prompt:
        return

    history = user_history[user_id]
    history.append(types.Content(role="user", parts=[types.Part(text=prompt)]))
    history[:] = history[-MAX_HISTORY_MESSAGES:]

    await update.message.chat.send_action(ChatAction.TYPING)
    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=history,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=0.7,
            ),
        )
        answer = (response.text or "ပြန်လည်ဖြေကြားချက် မရရှိပါ။").strip()
        history.append(types.Content(role="model", parts=[types.Part(text=answer)]))
        history[:] = history[-MAX_HISTORY_MESSAGES:]
        for chunk in split_message(answer):
            await update.message.reply_text(chunk)
    except Exception:
        logger.exception("Gemini request failed for user %s", user_id)
        # Remove the failed prompt so a transient error does not corrupt context.
        if history and history[-1].role == "user":
            history.pop()
        await update.message.reply_text(
            "တောင်းပန်ပါတယ်။ Gemini API ချိတ်ဆက်ရာမှာ အခက်အခဲရှိနေပါတယ်။ ခဏနောက် ပြန်စမ်းပါ။"
        )


def main() -> None:
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("reset", reset))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info("Bot started with model %s", GEMINI_MODEL)
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
