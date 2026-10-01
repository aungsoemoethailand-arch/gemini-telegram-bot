import asyncio
import logging
import os
from collections import defaultdict

from dotenv import load_dotenv
from google import genai
from google.genai import types
from telegram import Update
from telegram.constants import ChatAction, ChatType
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
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "12"))
ADMIN_TELEGRAM_ID = int(os.getenv("ADMIN_TELEGRAM_ID", "0") or "0")

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


async def generate_with_retry(contents: list[types.Content]):
    """Retry temporary Gemini capacity/rate-limit failures before giving up."""
    for attempt in range(3):
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
            if not transient or attempt == 2:
                raise
            delay = 3 * (2**attempt)
            logger.warning(
                "Temporary Gemini failure; retrying in %ss (attempt %s/3): %s",
                delay,
                attempt + 1,
                type(exc).__name__,
            )
            await asyncio.sleep(delay)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "မင်္ဂလာပါ။ Gemini AI Bot ဖြစ်ပါတယ်။\n"
        "မေးချင်တာကို စာရိုက်ပို့ပါ။ စကားဝိုင်းအသစ်စရန် /reset ကိုသုံးပါ။"
    )


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
    if not is_admin(user_id) and user_id not in allowed_user_ids:
        await update.message.reply_text("ခွင့်ပြုထားသော user မဟုတ်ပါ။ Admin ကို DM မှာ ဆက်သွယ်ပါ။")
        return

    prompt = update.message.text.strip()
    if not prompt:
        return

    history = user_history[user_id]
    history.append(types.Content(role="user", parts=[types.Part(text=prompt)]))
    history[:] = history[-MAX_HISTORY_MESSAGES:]

    await update.message.chat.send_action(ChatAction.TYPING)
    try:
        response = await generate_with_retry(history)
        answer = (response.text or "ပြန်လည်ဖြေကြားချက် မရရှိပါ။").strip()
        history.append(types.Content(role="model", parts=[types.Part(text=answer)]))
        history[:] = history[-MAX_HISTORY_MESSAGES:]
        for chunk in split_message(answer):
            await update.message.reply_text(chunk)
    except Exception as exc:
        logger.exception("Gemini request failed for user %s", user_id)
        # Remove the failed prompt so a transient error does not corrupt context.
        if history and history[-1].role == "user":
            history.pop()
        error_detail = str(exc).replace(GEMINI_API_KEY, "[REDACTED]")
        await update.message.reply_text(
            "တောင်းပန်ပါတယ်။ Gemini API ချိတ်ဆက်ရာမှာ အခက်အခဲရှိနေပါတယ်။\n"
            f"အကြောင်းရင်း: {type(exc).__name__}: {error_detail[:300]}"
        )


def main() -> None:
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("myid", my_id))
    application.add_handler(CommandHandler("allow", allow_user))
    application.add_handler(CommandHandler("remove", remove_user))
    application.add_handler(CommandHandler("reset", reset))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info("Bot started with model %s", GEMINI_MODEL)
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
