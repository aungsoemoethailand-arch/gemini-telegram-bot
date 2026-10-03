const MAX_BOOK_RESULTS = 40;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalize(value) {
  return String(value ?? "").toLowerCase().normalize("NFKC").replace(/[\s\-–—_.,၊။:;!?()[\]{}"'`]+/g, "");
}

function messageLink(chatId, messageId) {
  const id = String(chatId);
  return id.startsWith("-100") ? `https://t.me/c/${id.slice(4)}/${messageId}` : "";
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"' && quoted) {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function extractRecords(text, fallbackLink = "") {
  const clean = String(text || "").trim();
  if (!clean) return [];
  const lines = clean.split(/\r?\n/).filter(Boolean);
  if (lines.length > 1) {
    const header = parseCsvLine(lines[0]).map((x) => x.toLowerCase());
    const authorIndex = header.findIndex((x) => ["author", "စာရေးသူ"].includes(x));
    const titleIndex = header.findIndex((x) => ["title", "book", "စာအုပ်နာမည်", "စာအုပ်အမည်"].includes(x));
    const linkIndex = header.findIndex((x) => ["link", "url", "စာအုပ်လင့်", "လင့်"].includes(x));
    if (authorIndex >= 0 && titleIndex >= 0 && linkIndex >= 0) {
      return lines.slice(1).map(parseCsvLine).map((row) => ({
        author: row[authorIndex] || "",
        title: row[titleIndex] || "",
        link: row[linkIndex] || fallbackLink,
      })).filter((x) => x.author || x.title || x.link);
    }
  }
  const url = clean.match(/https?:\/\/\S+/)?.[0]?.replace(/[\])}>,။၊]+$/, "") || fallbackLink;
  let author = "";
  let title = "";
  for (const line of lines) {
    const authorMatch = line.match(/^(?:စာရေးသူ|author)\s*[:：-]\s*(.+)$/i);
    const titleMatch = line.match(/^(?:စာအုပ်နာမည်|စာအုပ်အမည်|title|book)\s*[:：-]\s*(.+)$/i);
    if (authorMatch) author = authorMatch[1].trim();
    if (titleMatch) title = titleMatch[1].trim();
  }
  if (!author || !title) {
    const parts = clean.replace(/\r?\n/g, " ").split(/\s*[-–—|]\s*/);
    if (parts.length >= 2) {
      author ||= parts[0].trim();
      title ||= parts[1].trim();
    }
  }
  return [{ author, title, link: url }];
}

async function telegram(env, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Telegram ${method} HTTP ${response.status}`);
  return response.json();
}

async function ensureWebhook(env) {
  if (env.ENABLE_WEBHOOK !== "true" || !env.TELEGRAM_BOT_TOKEN || !env.WORKER_URL) return;
  await telegram(env, "setWebhook", {
    url: env.WORKER_URL,
    secret_token: env.TELEGRAM_SECRET_TOKEN || undefined,
    allowed_updates: ["message", "channel_post"],
  });
}

async function sendMessage(env, chatId, text, extra = {}) {
  return telegram(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

async function telegramHealth(env) {
  if (!env.TELEGRAM_BOT_TOKEN) return "missing token";
  try {
    const result = await telegram(env, "getMe", {});
    return result.ok ? "ok" : "telegram error";
  } catch (error) {
    console.error("Telegram health failed", error?.message || "unknown error");
    return "error";
  }
}

async function webhookHealth(env) {
  try {
    const result = await telegram(env, "getWebhookInfo", {});
    const info = result.result || {};
    return `pending ${info.pending_update_count || 0}${info.last_error_message ? `; error ${info.last_error_message}` : ""}`;
  } catch {
    return "unavailable";
  }
}

async function saveRecords(env, chatId, messageId, records, rawText) {
  const statements = records.map((record, recordNo) => env.DB.prepare(
    `INSERT INTO books(chat_id,message_id,record_no,author,title,link,raw_text,created_at)
     VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(chat_id,message_id,record_no) DO UPDATE SET
       author=excluded.author,title=excluded.title,link=excluded.link,
       raw_text=excluded.raw_text,created_at=excluded.created_at`
  ).bind(
    chatId,
    messageId,
    recordNo,
    record.author || "",
    record.title || "",
    record.link || messageLink(chatId, messageId),
    rawText || "",
    new Date().toISOString(),
  ));
  if (statements.length) await env.DB.batch(statements);
}

async function importChannelPost(env, post) {
  const text = post.text || post.caption || "";
  if (post.document?.file_name?.toLowerCase().endsWith(".csv")) {
    const file = await telegram(env, "getFile", { file_id: post.document.file_id });
    const response = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.result.file_path}`);
    const csv = await response.text();
    await saveRecords(env, post.chat.id, post.message_id, extractRecords(csv), csv);
    return;
  }
  if (text) await saveRecords(env, post.chat.id, post.message_id, extractRecords(text, messageLink(post.chat.id, post.message_id)), text);
}

async function searchBooks(env, query) {
  const rows = await env.DB.prepare(
    "SELECT author,title,link FROM books ORDER BY id DESC LIMIT 2000"
  ).all();
  const needle = normalize(query);
  return (rows.results || []).filter((row) => normalize(row.author).includes(needle) || normalize(row.title).includes(needle)).slice(0, MAX_BOOK_RESULTS);
}

async function searchExactBook(env, query) {
  const needle = normalize(query);
  const rows = await env.DB.prepare("SELECT author,title,link FROM books ORDER BY id DESC LIMIT 2000").all();
  return (rows.results || []).filter((row) => normalize(row.author) === needle || normalize(row.title) === needle).slice(0, MAX_BOOK_RESULTS);
}

async function sendSearch(env, chatId, query) {
  const rows = await searchBooks(env, query);
  if (!rows.length) return sendMessage(env, chatId, "ထည့်သွင်းထားတဲ့ catalog ထဲမှာ မတွေ့ပါ။");
  const text = `<b>📚 ရှာဖွေမှုရလဒ် (${rows.length} ခု)</b>`;
  const buttons = rows.filter((row) => row.link).map((row, i) => [{
    text: `📖 ${`${i + 1}. ${row.title || "စာအုပ်"}${row.author ? ` — ${row.author}` : ""}`.slice(0, 60)}`,
    url: row.link,
  }]);
  return sendMessage(env, chatId, text, { reply_markup: { inline_keyboard: buttons } });
}

async function handleCommand(env, message) {
  const text = String(message.text || "").trim();
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const query = args.join(" ").trim();
  const chatId = message.chat.id;
  if (command === "/start" || command === "/help") {
    return sendMessage(env, chatId, "<b>📚 စာအုပ်ရှာဖွေရေး Bot</b>\n\nအောက်က menu ကနေ ရွေးနိုင်ပါတယ်ရှင်။", { reply_markup: { inline_keyboard: [
      [{ text: "🔎 စာအုပ်ရှာမယ်", callback_data: "help_search" }, { text: "✍️ စာရေးသူများ", callback_data: "help_authors" }],
      [{ text: "📚 စာအုပ်များ", callback_data: "help_books" }, { text: "📊 အခြေအနေ", callback_data: "help_stats" }],
    ] } });
  }
  if (command === "/search" || command === "/find") {
    return query ? sendSearch(env, chatId, query) : sendMessage(env, chatId, "သုံးပုံ: /search စာအုပ်နာမည် သို့မဟုတ် စာရေးသူ");
  }
  if (command === "/authors") {
    const rows = await env.DB.prepare("SELECT author,COUNT(*) AS count FROM books WHERE author<>'' GROUP BY author ORDER BY count DESC,author LIMIT 100").all();
    const text = (rows.results || []).map((row, i) => `${i + 1}. <b>${escapeHtml(row.author)}</b> — ${row.count} အုပ်`).join("\n");
    return sendMessage(env, chatId, text || "စာရေးသူစာရင်း မရှိသေးပါ။");
  }
  if (command === "/books") {
    const rows = await env.DB.prepare("SELECT title,author,link FROM books ORDER BY id DESC LIMIT 100").all();
    const buttons = (rows.results || []).filter((row) => row.link).map((row) => [{ text: `${row.title || "စာအုပ်"}${row.author ? ` — ${row.author}` : ""}`.slice(0, 60), url: row.link }]);
    return sendMessage(env, chatId, buttons.length ? "<b>📚 စာအုပ်စာရင်း</b>\nအောက်က စာအုပ်ကို ရွေးပါရှင်။" : "စာအုပ်စာရင်း မရှိသေးပါ။", buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {});
  }
  if (command === "/stats") {
    const row = await env.DB.prepare("SELECT COUNT(*) AS books,COUNT(DISTINCT NULLIF(author,'')) AS authors FROM books").first();
    return sendMessage(env, chatId, `<b>📊 Catalog စာရင်းအခြေအနေ</b>\n\n📚 စာအုပ်စုစုပေါင်း: <b>${row?.books || 0}</b> အုပ်\n✍️ စာရေးသူစုစုပေါင်း: <b>${row?.authors || 0}</b> ဦး`);
  }
  return null;
}

async function handleMessage(env, message) {
  const text = String(message.text || "").trim();
  if (!text) return;
  if (text.startsWith("/")) return handleCommand(env, message);
  const isGroup = ["group", "supergroup"].includes(message.chat?.type);
  const replyTarget = message.reply_to_message;
  if (isGroup && replyTarget?.from && !replyTarget.from.is_bot) return;
  const rows = isGroup ? await searchExactBook(env, text) : await searchBooks(env, text);
  if (!rows.length) return null;
  const result = rows.map((row, i) => `${i + 1}. <b>${escapeHtml(row.title || "ခေါင်းစဉ်မရှိ")}</b>${row.author ? ` — ${escapeHtml(row.author)}` : ""}\n<a href="${escapeHtml(row.link)}">📖 ဖတ်ရန် / ရယူရန်</a>`).join("\n\n");
  const buttons = rows.filter((row) => row.link).map((row, i) => [{
    text: `📖 ${`${i + 1}. ${row.title || "စာအုပ်"}${row.author ? ` — ${row.author}` : ""}`.slice(0, 60)}`,
    url: row.link,
  }]);
  return sendMessage(env, message.chat.id, `<b>📚 ရှာဖွေမှုရလဒ် (${rows.length} ခု)</b>\n\n${result}`, { reply_markup: { inline_keyboard: buttons } });
}

async function handleCallback(env, query) {
  await telegram(env, "answerCallbackQuery", { callback_query_id: query.id });
  const action = query.data;
  const message = query.message;
  if (!message) return;
  if (action === "help_search") return sendMessage(env, message.chat.id, "သုံးပုံ: /search စာအုပ်နာမည် သို့မဟုတ် စာရေးသူ");
  if (action === "help_authors") return handleCommand(env, { chat: message.chat, text: "/authors" });
  if (action === "help_books") return handleCommand(env, { chat: message.chat, text: "/books" });
  if (action === "help_stats") return handleCommand(env, { chat: message.chat, text: "/stats" });
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(ensureWebhook(env));
  },

  async fetch(request, env, ctx) {
    try {
      if (new URL(request.url).pathname === "/health") {
        return new Response(`Worker OK; Telegram API: ${await telegramHealth(env)}; Webhook: ${await webhookHealth(env)}`);
      }
      if (request.method === "GET") return new Response("gemini-telegram-webhook is running");
      if (env.TELEGRAM_SECRET_TOKEN && request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_SECRET_TOKEN) return new Response("Unauthorized", { status: 401 });
      const update = await request.json();
      if (update.channel_post) {
        ctx.waitUntil(importChannelPost(env, update.channel_post).catch((error) => console.error("Channel import failed", error?.message || "unknown error")));
      } else if (update.callback_query) {
        ctx.waitUntil(handleCallback(env, update.callback_query).catch((error) => console.error("Callback failed", error?.message || "unknown error")));
      } else if (update.message?.text) {
        ctx.waitUntil(handleMessage(env, update.message).catch((error) => console.error("Message handling failed", error?.message || "unknown error")));
      }
      return new Response("OK");
    } catch (error) {
      console.error(error);
      return new Response("OK");
    }
  },
};
