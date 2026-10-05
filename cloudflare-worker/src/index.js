const MAX_BOOK_RESULTS = 40;

const SEARCH_INTROS = [
  "စာအုပ်စာရင်းကို ရှာပေးထားပါတယ်ရှင်။",
  "ရှာတွေ့တဲ့ စာအုပ်တွေကို စုစည်းပေးထားပါတယ်ရှင်။",
  "ဒီနာမည်နဲ့ ကိုက်ညီတဲ့ စာအုပ်တွေကို တွေ့ပါပြီရှင်။",
  "စာအုပ်လေးတွေကို ရှာပေးထားပါတယ်နော်။",
  "ရလဒ်တွေ ရှာတွေ့ပါပြီရှင်။ အောက်မှာ ကြည့်လို့ရပါတယ်နော်။",
  "မေးထားတဲ့ စာရေးသူ/စာအုပ်နာမည်နဲ့ ကိုက်တာတွေကို ရှာပေးထားပါတယ်ရှင်။",
  "အောက်မှာ စာအုပ်လင့်တွေနဲ့အတူ စီပေးထားပါတယ်နော်။",
  "တွေ့ထားတဲ့ စာအုပ်လေးတွေကို တစ်နေရာတည်းမှာ စုထားပေးပါတယ်ရှင်။",
  "ရှာပေးထားတဲ့ စာအုပ်တွေထဲက ကြိုက်တာလေး ရွေးကြည့်လို့ရပါတယ်နော်။",
  "စာအုပ်တွေကို စစ်ပြီး ရှာတွေ့သမျှ ပြပေးထားပါတယ်ရှင်။",
  "ဒီရှာဖွေမှုအတွက် ရလဒ်ကောင်းလေးတွေ တွေ့ပါပြီနော်။",
  "စာအုပ်ရှာပေးထားပါတယ်ရှင်၊ အောက်က ခလုတ်လေးတွေကနေ တိုက်ရိုက်ဖတ်လို့ရပါတယ်။",
];
const lastSearchIntro = new Map();
const chatWriteCache = new Map();
const userWriteCache = new Map();
let botIdentityCache = null;

function nextSearchIntro(chatId) {
  const previous = lastSearchIntro.get(String(chatId));
  const choices = SEARCH_INTROS.map((_, index) => index).filter((index) => index !== previous);
  const index = choices[Math.floor(Math.random() * choices.length)] ?? 0;
  lastSearchIntro.set(String(chatId), index);
  if (lastSearchIntro.size > 500) lastSearchIntro.delete(lastSearchIntro.keys().next().value);
  return index;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function userMention(user) {
  if (!user?.id) return "";
  const name = user.username ? `@${user.username}` : ([user.first_name, user.last_name].filter(Boolean).join(" ") || "မိတ်ဆွေ");
  return `<a href="tg://user?id=${user.id}">${escapeHtml(name)}</a>`;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, "")
    .replace(/[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu, "")
    .toLowerCase()
    .replace(/[\s\-–—_.,၊။:;!?()[\]{}"'`/\\|+*=<>၊။၊]+/gu, "");
}

const REVIEW_SITE_BASE = "https://whispermmepub.github.io/Review/";

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function reviewMatches(query) {
  const cleanedQuery = String(query || "").replace(/(?:အကြောင်းအရာ|အညွှန်း|အကြောင်း|review|summary|ဘာလဲ)/gi, " ").trim();
  const needle = normalize(cleanedQuery);
  const terms = cleanedQuery.split(/\s+/).map(normalize).filter((term) => term.length > 1);
  if (!needle) return [];
  try {
    const response = await fetch(`${REVIEW_SITE_BASE}assets/posts.json`, { headers: { "user-agent": "gemini-telegram-webhook/1.0" } });
    if (!response.ok) return [];
    const posts = await response.json();
    const ranked = (posts || []).map((post) => {
      const haystack = normalize([post.title, post.author, post.excerpt].join(" "));
      const matched = terms.filter((term) => haystack.includes(term)).length;
      const score = haystack.includes(needle) ? 1 : (terms.length ? matched / terms.length : 0);
      return { post, score };
    }).filter((item) => item.score >= (terms.length > 1 ? 0.5 : 1)).sort((a, b) => b.score - a.score).slice(0, 5);
    const results = [];
    for (const { post } of ranked) {
      const link = new URL(String(post.link || ""), REVIEW_SITE_BASE).toString();
      let body = String(post.excerpt || "");
      try {
        const detail = await fetch(link, { headers: { "user-agent": "gemini-telegram-webhook/1.0" } });
        if (detail.ok) body = stripHtml(await detail.text());
      } catch {}
      results.push({ author: post.author || "", title: post.title || "", link, body: body.slice(0, 3500) });
    }
    return results;
  } catch (error) {
    console.error("Review lookup failed", error?.message || "unknown error");
    return [];
  }
}

async function localReviewMatches(env, query) {
  const cleanedQuery = String(query || "").replace(/(?:အကြောင်းအရာ|အညွှန်း|အကြောင်း|review|summary|ဘာလဲ)/gi, " ").trim();
  const needle = normalize(cleanedQuery);
  const rows = await env.DB.prepare("SELECT chat_id,author,title,link,raw_text FROM books ORDER BY id DESC LIMIT 2000").all();
  return (rows.results || []).filter((row) => {
    const raw = String(row.raw_text || "");
    return isReviewRecord(row) && (normalize(row.author).includes(needle) || normalize(row.title).includes(needle) || normalize(raw).includes(needle));
  }).slice(0, 5).map((row) => ({ author: row.author || "", title: row.title || "", link: row.link || "", body: String(row.raw_text || "").slice(0, 3500) }));
}

function messageLink(chatId, messageId) {
  const id = String(chatId);
  return id.startsWith("-100") ? `https://t.me/c/${id.slice(4)}/${messageId}` : "";
}

function isGroupMessage(message) {
  return ["group", "supergroup"].includes(message?.chat?.type);
}

function isGroupChat(chat) {
  return ["group", "supergroup"].includes(chat?.type);
}

function autoDeleteEnabled(env) {
  return env.AUTO_DELETE_ENABLED !== "false" && env.AUTO_DELETE_ENABLED !== "0";
}

function commandDeleteSeconds(env) {
  return Math.max(0, Number(env.COMMAND_AUTO_DELETE_SECONDS || 30));
}

function resultDeleteSeconds(env) {
  return Math.max(0, Number(env.AUTO_DELETE_MINUTES || 3) * 60);
}

function adminId(env) {
  return String(env.ADMIN_TELEGRAM_ID || env.ADMIN_TELEGRAM_ID2 || "").trim();
}

async function rememberUser(env, user) {
  if (!user?.id) return;
  const cacheKey = String(user.id);
  const now = Date.now();
  if (now - Number(userWriteCache.get(cacheKey) || 0) < 600000) return;
  userWriteCache.set(cacheKey, now);
  if (userWriteCache.size > 1000) userWriteCache.delete(userWriteCache.keys().next().value);
  await env.DB.prepare(
    `INSERT INTO known_users(user_id,username,first_name,updated_at) VALUES(?,?,?,datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,updated_at=excluded.updated_at`
  ).bind(user.id, user.username || "", user.first_name || user.last_name || "").run();
}

async function isAdmin(env, user) {
  return Boolean(user?.id && adminId(env) && String(user.id) === adminId(env));
}

async function rememberChat(env, chat) {
  if (!chat?.id || !["group", "supergroup", "channel"].includes(chat.type)) return;
  const cacheKey = String(chat.id);
  const now = Date.now();
  if (now - Number(chatWriteCache.get(cacheKey) || 0) < 300000) return;
  chatWriteCache.set(cacheKey, now);
  if (chatWriteCache.size > 300) chatWriteCache.delete(chatWriteCache.keys().next().value);
  await env.DB.prepare(
    `INSERT INTO connected_chats(chat_id,chat_type,title,username,last_seen) VALUES(?,?,?,?,?)
     ON CONFLICT(chat_id) DO UPDATE SET chat_type=excluded.chat_type,title=excluded.title,username=excluded.username,last_seen=excluded.last_seen`
  ).bind(chat.id, chat.type, chat.title || "", chat.username || "", Math.floor(Date.now() / 1000)).run();
}

async function getBotIdentity(env) {
  if (botIdentityCache && Date.now() - botIdentityCache.cachedAt < 900000) return botIdentityCache.value;
  const value = (await telegram(env, "getMe", {})).result || {};
  botIdentityCache = { value, cachedAt: Date.now() };
  return value;
}

async function claimWebhookUpdate(env, updateId) {
  if (updateId === undefined || updateId === null) return true;
  const result = await env.DB.prepare(
    "INSERT OR IGNORE INTO webhook_updates(update_id,received_at) VALUES(?,?)"
  ).bind(Number(updateId), Math.floor(Date.now() / 1000)).run();
  return Number(result?.meta?.changes || 0) === 1;
}

async function pruneWebhookUpdates(env) {
  await env.DB.prepare("DELETE FROM webhook_updates WHERE received_at < ?")
    .bind(Math.floor(Date.now() / 1000) - 172800).run();
}

async function connectedGroups(env) {
  const rows = await env.DB.prepare("SELECT chat_id,chat_type,title,username FROM connected_chats WHERE chat_type IN ('group','supergroup') ORDER BY title").all();
  let botId = null;
  try { botId = (await telegram(env, "getMe", {})).result?.id; } catch {}
  const groups = [];
  for (const row of rows.results || []) {
    try {
      const chat = (await telegram(env, "getChat", { chat_id: row.chat_id })).result || {};
      let status = "unknown";
      if (botId) status = (await telegram(env, "getChatMember", { chat_id: row.chat_id, user_id: botId })).result?.status || "unknown";
      if (!["member", "administrator", "creator"].includes(status)) continue;
      const link = chat.invite_link || (chat.username ? `https://t.me/${chat.username}` : "");
      groups.push({ chatId: row.chat_id, title: chat.title || row.title || "အမည်မရှိ group", status, link });
    } catch (error) {
      console.log("Connected chat check skipped", row.chat_id, error?.message || "unknown error");
    }
  }
  return groups;
}

const MORNING_GREETING_TEXTS = [
  "🌅 <b>မင်္ဂလာနံနက်ခင်းပါရှင်</b>\nဒီနေ့လည်း စိတ်ချမ်းသာ၊ ကိုယ်ကျန်းမာပြီး ကောင်းမွန်တဲ့နေ့လေး ဖြစ်ပါစေ 📚✨",
  "☀️ <b>Good Morning ပါရှင်</b>\nစာကောင်းတစ်အုပ်နဲ့ စိတ်ကောင်းတစ်စင်းကို ယနေ့နေ့သစ်မှာ ရရှိပါစေ 💛",
  "🌤️ <b>မနက်ခင်းမင်္ဂလာပါ</b>\nအိပ်မက်ကောင်းတွေကို လက်တွေ့အောင်မြင်မှုအဖြစ် ပြောင်းလဲနိုင်တဲ့နေ့ ဖြစ်ပါစေ 🌱",
  "🌼 <b>သာယာတဲ့မနက်ခင်းပါ</b>\nဒီနေ့ရဲ့ အစတိုင်းမှာ အပြုံးနဲ့ ကံကောင်းခြင်းတွေ ပါလာပါစေ 📖",
  "🌞 <b>မင်္ဂလာမနက်ခင်းပါ</b>\nစိတ်ထဲမှာ အလင်းရောင်၊ လက်ထဲမှာ စာအုပ်ကောင်းတစ်အုပ် ရှိပါစေ ✨",
  "☕ <b>Good Morning အားလုံး</b>\nကော်ဖီပူပူတစ်ခွက်လို နွေးထွေးတဲ့နေ့လေး ဖြစ်ပါစေရှင် ☕📚",
  "🌈 <b>မနက်ခင်းလေး လှပပါစေ</b>\nအခက်အခဲတိုင်းကို အေးအေးဆေးဆေး ကျော်ဖြတ်နိုင်ပါစေ 💜",
  "🌻 <b>မင်္ဂလာပါရှင်</b>\nဒီနေ့မှာ ကောင်းသောသတင်း၊ ကောင်းသောလူ၊ ကောင်းသောအခွင့်အရေးတွေ တွေ့ပါစေ 🌻",
  "📚 <b>စာဖတ်သူတို့ရဲ့ မနက်ခင်းမင်္ဂလာပါ</b>\nစာတစ်မျက်နှာက အတွေးတစ်ခုကို ပြောင်းလဲပေးနိုင်ပါတယ်။ ဒီနေ့လည်း စာဖတ်ကြရအောင် ✨",
  "🌅 <b>နံနက်ခင်းအလင်းရောင်နဲ့အတူ</b>\nစိတ်သစ်၊ အားသစ်နဲ့ နေ့သစ်ကို စတင်နိုင်ပါစေရှင် 💫",
  "💐 <b>Good Morning ပါ</b>\nမနေ့ကထက် ပိုကောင်းတဲ့ ကိုယ့်ကိုယ်ကို ဒီနေ့မှာ တွေ့ရှိနိုင်ပါစေ 🌷",
  "🌤️ <b>မင်္ဂလာနံနက်ခင်းပါ</b>\nစိတ်ပူပန်မှုတွေ လျော့ပြီး ပျော်ရွှင်မှုတွေ တိုးပွားပါစေရှင် 😊",
  "☀️ <b>နေ့သစ်မင်္ဂလာပါ</b>\nရည်မှန်းချက်လေးတစ်ခုကို ဒီနေ့မှာ စတင်အကောင်အထည်ဖော်နိုင်ပါစေ 🚀",
  "🌿 <b>အေးချမ်းတဲ့မနက်ခင်းပါ</b>\nစိတ်အေးချမ်းခြင်းနဲ့ အောင်မြင်ခြင်းတွေ ဒီနေ့တစ်နေ့လုံး အတူရှိပါစေ 🍃",
  "📖 <b>စာအုပ်နံ့သင်းတဲ့ မနက်ခင်းပါ</b>\nဖတ်သမျှစာတွေက အသိပညာနဲ့ အားအင်ကောင်းတွေ ဖြစ်လာပါစေရှင် 💙",
  "🌞 <b>Good Morning သူငယ်ချင်းတို့</b>\nအပြုံးတစ်ပွင့်နဲ့ စတင်တဲ့နေ့ဟာ လှပတဲ့နေ့ပါ။ အားလုံးပြုံးနိုင်ပါစေ 😊",
  "🌸 <b>မနက်ခင်းမင်္ဂလာပါ</b>\nဒီနေ့မှာ ကိုယ်ချစ်တဲ့သူတွေနဲ့ နွေးထွေးတဲ့အချိန်တွေ ရပါစေ 🌸",
  "✨ <b>နေ့သစ်ရောက်ပါပြီ</b>\nမဖြစ်နိုင်ဘူးလို့ ထင်ခဲ့တာတွေထဲက တစ်ခုကို ဒီနေ့မှာ ဖြစ်အောင်လုပ်နိုင်ပါစေ 💪",
  "🌅 <b>မင်္ဂလာနံနက်ခင်းပါရှင်</b>\nအလုပ်အကိုင်အဆင်ပြေ၊ စိတ်ချမ်းသာပြီး ကံကောင်းခြင်းများ ရရှိပါစေ 🙏",
  "☕ <b>နံနက်ခင်းလေး သာယာပါစေ</b>\nနားလည်မှုကောင်း၊ စကားကောင်း၊ အတွေးကောင်းတွေနဲ့ ပြည့်စုံပါစေ 📚",
  "🌈 <b>Good Morning ပါ</b>\nဒီနေ့ရဲ့ အခွင့်အရေးတွေကို သတ္တိရှိရှိ ဆုပ်ကိုင်နိုင်ပါစေရှင် 🌈",
  "🌺 <b>မင်္ဂလာမနက်ခင်းပါ</b>\nအေးချမ်းခြင်းက အိမ်မှာ၊ အောင်မြင်ခြင်းက အလုပ်မှာ၊ ပျော်ရွှင်ခြင်းက နှလုံးသားမှာ ရှိပါစေ 💗",
  "📚 <b>စာဖတ်သူများအားလုံး မင်္ဂလာပါ</b>\nဒီနေ့ဖတ်မယ့် စာအုပ်က ဘဝအတွက် အတွေးသစ်တစ်ခု ပေးပါစေ 📖",
  "🌤️ <b>မနက်ခင်းလှလှလေး ဖြစ်ပါစေ</b>\nစတင်ဖို့ အကောင်းဆုံးအချိန်က အခုပါပဲ။ နေ့သစ်ကို ယုံကြည်ချက်နဲ့ စလိုက်ပါ ✨",
  "🌻 <b>Good Morning အားလုံး</b>\nနေ့တိုင်းမှာ ကျေးဇူးတင်စရာလေးတွေ ရှာတွေ့နိုင်ပါစေရှင် 💛",
  "☀️ <b>မင်္ဂလာနံနက်ခင်းပါ</b>\nကျန်းမာခြင်း၊ ချမ်းသာခြင်း၊ စိတ်ချမ်းသာခြင်းတို့နဲ့ ပြည့်စုံပါစေ 🙏",
  "🌿 <b>သာယာတဲ့နေ့သစ်ပါရှင်</b>\nစိတ်ညစ်စရာတွေ လွင့်ပါးပြီး ကောင်းမွန်တဲ့အရာတွေ နီးကပ်လာပါစေ 🍀",
  "💫 <b>မနက်ခင်းမင်္ဂလာပါ</b>\nအိပ်မက်တွေကို မမေ့ဘဲ ဒီနေ့မှာ ခြေလှမ်းတစ်လှမ်း ရှေ့ဆက်နိုင်ပါစေ 🚶",
  "🌸 <b>Good Morning ပါရှင်</b>\nဒီနေ့က မနေ့ကထက် ပိုလှပပြီး မနက်ဖြန်အတွက် ပိုကောင်းတဲ့အမှတ်တရ ဖြစ်ပါစေ 🌸",
  "📖 <b>စာအုပ်ကောင်းနဲ့ နေ့သစ်စကြရအောင်</b>\nအားလုံးအတွက် အောင်မြင်ခြင်းနဲ့ ပျော်ရွှင်ခြင်းများ ရရှိပါစေ ✨",
];

function bangkokClock() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour), minute: Number(values.minute) };
}

async function sendMorningGreetings(env) {
  const clock = bangkokClock();
  if (clock.hour !== 7 || clock.minute > 4) return;
  const groups = await connectedGroups(env);
  const dayNumber = Math.floor(Date.parse(`${clock.date}T00:00:00Z`) / 86400000);
  const greeting = MORNING_GREETING_TEXTS[((dayNumber % MORNING_GREETING_TEXTS.length) + MORNING_GREETING_TEXTS.length) % MORNING_GREETING_TEXTS.length];
  for (const group of groups) {
    const reservation = await env.DB.prepare(
      "INSERT OR IGNORE INTO morning_greetings(chat_id,greeting_date,greeting_text,sent_at) VALUES(?,?,?,?)"
    ).bind(group.chatId, clock.date, greeting, Math.floor(Date.now() / 1000)).run();
    if (reservation.meta?.changes !== 1) continue;
    try {
      const sent = await sendMessage(env, group.chatId, greeting);
      await env.DB.prepare("UPDATE morning_greetings SET message_id=? WHERE chat_id=? AND greeting_date=?")
        .bind(sent.result?.message_id || null, group.chatId, clock.date).run();
    } catch (error) {
      await env.DB.prepare("DELETE FROM morning_greetings WHERE chat_id=? AND greeting_date=?").bind(group.chatId, clock.date).run();
      console.log("Morning greeting failed", group.chatId, error?.message || "unknown error");
    }
  }
}

async function resolveUserId(env, value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^-?\d+$/.test(raw)) return raw;
  const username = raw.replace(/^@/, "").toLowerCase();
  const row = await env.DB.prepare("SELECT user_id FROM known_users WHERE lower(username)=?").bind(username).first();
  return row?.user_id ? String(row.user_id) : null;
}

function normalizeChatTarget(value) {
  const raw = String(value || "").trim();
  if (/^-?\d+$/.test(raw)) return raw;
  const withoutQuery = raw.split(/[?#]/, 1)[0].replace(/\/$/, "");
  const match = withoutQuery.match(/^(?:https?:\/\/)?(?:www\.)?t\.me\/([A-Za-z0-9_]+)$/i);
  if (match) return `@${match[1]}`;
  return withoutQuery.startsWith("@") ? withoutQuery : `@${withoutQuery}`;
}

async function queueDelete(env, chatId, messageId, seconds) {
  if (!autoDeleteEnabled(env) || !chatId || !messageId || seconds <= 0) return;
  await env.DB.prepare("INSERT OR IGNORE INTO cleanup_tasks(chat_id,message_id,delete_at) VALUES(?,?,?)")
    .bind(chatId, messageId, Math.floor(Date.now() / 1000) + seconds).run();
}

async function cleanupDue(env) {
  if (!autoDeleteEnabled(env)) return;
  const rows = await env.DB.prepare("SELECT id,chat_id,message_id FROM cleanup_tasks WHERE delete_at<=? LIMIT 100")
    .bind(Math.floor(Date.now() / 1000)).all();
  for (const row of rows.results || []) {
    try { await telegram(env, "deleteMessage", { chat_id: row.chat_id, message_id: row.message_id }); } catch (error) {
      console.log("Delete skipped", error?.message || "unknown error");
    }
    await env.DB.prepare("DELETE FROM cleanup_tasks WHERE id=?").bind(row.id).run();
  }
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

function extractHashtagReview(text, fallbackLink = "") {
  const tags = String(text || "").match(/#([^\s#]+)/g)?.map((tag) => tag.slice(1)) || [];
  const reviewTags = new Set(["bookreview", "review", "စာအုပ်အညွှန်း"]);
  if (!tags.some((tag) => reviewTags.has(tag.toLowerCase()))) return null;
  const meaningful = tags.filter((tag) => !reviewTags.has(tag.toLowerCase()));
  if (!meaningful.length) return null;
  return {
    author: meaningful.length >= 2 ? meaningful[0] : "",
    title: meaningful.length >= 2 ? meaningful[1] : meaningful[0],
    link: String(text || "").match(/https?:\/\/\S+/)?.[0]?.replace(/[\])}>,။၊]+$/, "") || fallbackLink,
  };
}

function isReviewRecord(row) {
  const raw = String(row?.raw_text || "");
  const author = String(row?.author || "");
  const title = String(row?.title || "");
  const link = String(row?.link || "");
  const metadata = [author, title, link].filter(Boolean).join(" - ");
  const hasReviewTag = /#(?:bookreview|review|စာအုပ်အညွှန်း)\b/i.test(raw);
  const hasReviewBody = raw.length > metadata.length + 80;
  return String(row?.chat_id || "") === "-2000000001" || hasReviewTag || hasReviewBody;
}

async function telegram(env, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(`Telegram ${method} HTTP ${response.status}: ${payload.description || "unknown error"}`);
  return payload;
}

async function ensureWebhook(env) {
  if (env.ENABLE_WEBHOOK !== "true" || !env.TELEGRAM_BOT_TOKEN || !env.WORKER_URL) return;
  await telegram(env, "setWebhook", {
    url: env.WORKER_URL,
    secret_token: env.TELEGRAM_SECRET_TOKEN || undefined,
    allowed_updates: ["message", "edited_message", "channel_post", "callback_query", "chat_member", "my_chat_member", "chat_join_request"],
  });
}

async function sendMessage(env, chatId, text, extra = {}) {
  const { __deleteAfterSeconds, ...telegramExtra } = extra;
  const result = await telegram(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...telegramExtra,
  });
  if (__deleteAfterSeconds && result.result?.message_id) {
    await queueDelete(env, chatId, result.result.message_id, __deleteAfterSeconds);
  }
  return result;
}

async function editMessage(env, chatId, messageId, text, extra = {}) {
  const { __deleteAfterSeconds, ...telegramExtra } = extra;
  return telegram(env, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...telegramExtra,
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
  if (text) {
    const review = extractHashtagReview(text, messageLink(post.chat.id, post.message_id));
    await saveRecords(env, post.chat.id, post.message_id, review ? [review] : extractRecords(text, messageLink(post.chat.id, post.message_id)), text);
  }
}

async function searchBooks(env, query) {
  const rows = await env.DB.prepare(
    "SELECT chat_id,author,title,link,raw_text FROM books ORDER BY id DESC LIMIT 2000"
  ).all();
  const needle = normalize(query);
  return (rows.results || []).filter((row) => !isReviewRecord(row) && (normalize(row.author).includes(needle) || normalize(row.title).includes(needle))).slice(0, MAX_BOOK_RESULTS);
}

async function searchExactBook(env, query) {
  const needle = normalize(query);
  const rows = await env.DB.prepare("SELECT chat_id,author,title,link,raw_text FROM books ORDER BY id DESC LIMIT 2000").all();
  return (rows.results || []).filter((row) => !isReviewRecord(row) && (normalize(row.author) === needle || normalize(row.title) === needle)).slice(0, MAX_BOOK_RESULTS);
}

async function sendSearchPage(env, chatId, query, page, cleanup = {}, exact = false, token = "", editMessageId = null, mention = "", introIndex = null, prefetchedRows = null) {
  const rows = prefetchedRows || (exact ? await searchExactBook(env, query) : await searchBooks(env, query));
  if (!rows.length) return sendMessage(env, chatId, `${mention ? `${mention} ရေ၊ ` : ""}ထည့်သွင်းထားတဲ့ catalog ထဲမှာ မတွေ့ပါဘူးရှင်။`, cleanup);
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.max(0, Math.min(Number(page) || 0, pageCount - 1));
  const visible = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const intro = SEARCH_INTROS[(Number.isInteger(introIndex) ? introIndex : 0) % SEARCH_INTROS.length];
  const greeting = mention ? `${mention} ရေ၊ ` : "";
  const lines = [`<b>${greeting}📚 ${escapeHtml(query)} စာအုပ် စုစုပေါင်း (${rows.length}) အုပ် ရှိပါတယ်ရှင်။</b>`, intro, `စာမျက်နှာ ${safePage + 1}/${pageCount}`];
  const buttons = [];
  visible.forEach((row, index) => {
    const number = safePage * pageSize + index + 1;
    lines.push(`\n<b>${number}. ${escapeHtml(row.title || "ခေါင်းစဉ်မရှိ")}</b>${row.author ? ` — ${escapeHtml(row.author)}` : ""}`);
    if (row.link) buttons.push([{ text: `📖 ${`${number}. ${row.title || "စာအုပ်"}`.slice(0, 58)}`, url: row.link }]);
  });
  if (pageCount > 1) {
    const nav = [];
    if (safePage > 0) nav.push({ text: "⬅️ နောက်ပြန်", callback_data: `search:${token}:${safePage - 1}` });
    if (safePage < pageCount - 1) nav.push({ text: "ရှေ့ဆက် ➡️", callback_data: `search:${token}:${safePage + 1}` });
    buttons.push(nav);
  }
  const payload = { ...cleanup, reply_markup: { inline_keyboard: buttons } };
  return editMessageId ? editMessage(env, chatId, editMessageId, lines.join("\n"), payload) : sendMessage(env, chatId, lines.join("\n"), payload);
}

async function sendSearch(env, chatId, query, cleanup = {}, exact = false, speaker = null, prefetchedRows = null) {
  const token = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const mention = speaker?.chatType && speaker.chatType !== "private" ? userMention(speaker.user) : "";
  const introIndex = nextSearchIntro(chatId);
  const storedQuery = JSON.stringify({ query, exact, mention, introIndex });
  await env.DB.prepare("INSERT OR REPLACE INTO search_sessions(token,query,created_at) VALUES(?,?,?)")
    .bind(token, storedQuery, Math.floor(Date.now() / 1000)).run();
  return sendSearchPage(env, chatId, query, 0, cleanup, exact, token, null, mention, introIndex, prefetchedRows);
}

async function catalogPage(env, chatId, kind, page, cleanup = {}, editMessageId = null) {
  const pageSize = 20;
  let items;
  if (kind === "authors") {
    const rows = await env.DB.prepare("SELECT chat_id,author,raw_text FROM books WHERE author<>'' ORDER BY author LIMIT 2000").all();
    const counts = new Map();
    for (const row of rows.results || []) if (!isReviewRecord(row)) counts.set(row.author, (counts.get(row.author) || 0) + 1);
    items = [...counts.entries()].map(([author, count]) => ({ author, count }));
  } else {
    const rows = await env.DB.prepare("SELECT chat_id,title,author,link,raw_text FROM books WHERE title<>'' ORDER BY title LIMIT 2000").all();
    items = (rows.results || []).filter((row) => !isReviewRecord(row));
  }
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.max(0, Math.min(Number(page) || 0, pageCount - 1));
  const visible = items.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const title = kind === "authors" ? "စာရေးသူစာရင်း" : "စာအုပ်စာရင်း";
  const lines = [`<b>📚 ${title} (${items.length} ခု)</b>`, `စာမျက်နှာ ${safePage + 1}/${pageCount}`];
  const buttons = [];
  visible.forEach((row, index) => {
    if (kind === "authors") {
      lines.push(`\n<b>${safePage * pageSize + index + 1}. ${escapeHtml(row.author)}</b> — စာအုပ် ${row.count} အုပ်`);
    } else {
      lines.push(`\n<b>${safePage * pageSize + index + 1}. ${escapeHtml(row.title)}</b>${row.author ? `\nစာရေးသူ: ${escapeHtml(row.author)}` : ""}`);
      if (row.link) buttons.push([{ text: `📖 ${String(row.title).slice(0, 52)}`, url: row.link }]);
    }
  });
  if (safePage > 0 || safePage < pageCount - 1) {
    const navigation = [];
    if (safePage > 0) navigation.push({ text: "⬅️ နောက်ပြန်", callback_data: `catalog:${kind}:${safePage - 1}` });
    if (safePage < pageCount - 1) navigation.push({ text: "ရှေ့ဆက် ➡️", callback_data: `catalog:${kind}:${safePage + 1}` });
    buttons.push(navigation);
  }
  const payload = { ...cleanup, ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}) };
  return editMessageId ? editMessage(env, chatId, editMessageId, lines.join("\n"), payload) : sendMessage(env, chatId, lines.join("\n"), payload);
}

async function sendReviews(env, chatId, query, reviews, cleanup = {}) {
  if (!reviews.length) return sendMessage(env, chatId, "ဒီစာအုပ်အတွက် review မတွေ့ပါ။", cleanup);
  const lines = [`<b>📖 မူရင်းအညွှန်း (${reviews.length} ခု)</b>`];
  const buttons = [];
  reviews.forEach((review, index) => {
    lines.push(`\n<b>${index + 1}. ${escapeHtml(review.title || query)}</b>`);
    if (review.author) lines.push(`စာရေးသူ: ${escapeHtml(review.author)}`);
    if (review.body) lines.push(`\n${escapeHtml(review.body)}`);
    if (review.link) buttons.push([{ text: `📖 ${String(review.title || query).slice(0, 52)}`, url: review.link }]);
  });
  return sendMessage(env, chatId, lines.join("\n"), { ...cleanup, ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}) });
}

async function isBotAdmin(env, user) {
  if (await isAdmin(env, user)) return true;
  if (!user?.id) return false;
  const row = await env.DB.prepare("SELECT user_id FROM bot_admins WHERE user_id=?").bind(user.id).first();
  return Boolean(row);
}

// Telegram can send an admin's command on behalf of the group profile
// (`sender_chat`) when Anonymous Admin / Send As Group is enabled. In that
// case the real user's admin identity is not present in `message.from`.
async function isAuthorizedGroupAdmin(env, message) {
  if (!isGroupMessage(message)) return false;
  if (message.sender_chat?.id && String(message.sender_chat.id) === String(message.chat?.id)) return true;
  if (await isBotAdmin(env, message.from)) return true;
  if (!message.from?.id) return false;
  try {
    const status = (await telegram(env, "getChatMember", {
      chat_id: message.chat.id,
      user_id: message.from.id,
    })).result?.status;
    return ["administrator", "creator"].includes(status);
  } catch (error) {
    console.log("Group admin check failed", error?.message || "unknown error");
    return false;
  }
}

async function auditAction(env, message, action, targetId = null, details = "") {
  const groupId = message.chat.id;
  await env.DB.prepare("INSERT INTO action_logs(group_chat_id,actor_id,action,target_id,details,created_at) VALUES(?,?,?,?,?,?)")
    .bind(groupId, message.from?.id || null, action, targetId, details, Math.floor(Date.now() / 1000)).run();
  const config = await env.DB.prepare("SELECT log_chat_id FROM log_configs WHERE group_chat_id=?").bind(groupId).first();
  if (!config?.log_chat_id) return;
  const actor = message.from?.username ? `@${message.from.username}` : String(message.from?.id || "unknown");
  const text = `<b>🛡 Group Audit</b>\nGroup: <b>${escapeHtml(message.chat.title || String(groupId))}</b>\nAction: <b>${escapeHtml(action)}</b>\nActor: <code>${escapeHtml(actor)}</code>${targetId ? `\nTarget: <code>${escapeHtml(targetId)}</code>` : ""}${details ? `\n${escapeHtml(details)}` : ""}`;
  try { await sendMessage(env, config.log_chat_id, text); } catch (error) { console.log("Audit log delivery failed", error?.message || "unknown error"); }
}

async function groupRules(env, chatId) {
  const row = await env.DB.prepare("SELECT rules FROM guardian_settings WHERE group_chat_id=?").bind(chatId).first();
  return String(row?.rules || "").trim();
}

async function setGroupRules(env, chatId, rules) {
  await env.DB.prepare(
    "INSERT INTO guardian_settings(group_chat_id,rules,updated_at) VALUES(?,?,?) ON CONFLICT(group_chat_id) DO UPDATE SET rules=excluded.rules,updated_at=excluded.updated_at"
  ).bind(chatId, rules, Math.floor(Date.now() / 1000)).run();
}

async function handleGuardianCommand(env, message, command, args, reply) {
  if (!isGroupMessage(message)) return false;
  if (command === "/rules") {
    const rules = await groupRules(env, message.chat.id);
    return Boolean(await reply(rules ? `<b>📜 ${escapeHtml(message.chat.title || "Group")} စည်းကမ်းများ</b>\n\n${escapeHtml(rules)}` : "📜 ဒီ group မှာ စည်းကမ်းစာ မသတ်မှတ်ရသေးပါဘူးရှင်။"));
  }
  if (["/setrules", "/clearrules"].includes(command)) {
    if (!(await isAuthorizedGroupAdmin(env, message))) { await reply("ဒီ command ကို group admin သို့မဟုတ် bot admin ပဲ သုံးနိုင်ပါတယ်။"); return true; }
    if (command === "/clearrules") {
      await setGroupRules(env, message.chat.id, "");
      await auditAction(env, message, "rules_cleared");
      await reply("✅ Group rules ကို ဖျက်ပြီးပါပြီရှင်။");
      return true;
    }
    const rules = args.join(" ").trim() || String(message.reply_to_message?.text || message.reply_to_message?.caption || "").trim();
    if (!rules) { await reply("သုံးပုံ: /setrules စည်းကမ်းစာသား\nသို့မဟုတ် စည်းကမ်းစာကို reply လုပ်ပြီး /setrules ရိုက်ပါ။"); return true; }
    await setGroupRules(env, message.chat.id, rules.slice(0, 3500));
    await auditAction(env, message, "rules_updated", null, rules.slice(0, 500));
    await reply("✅ Group rules ကို သိမ်းပြီးပါပြီရှင်။ /rules နဲ့ ပြန်ကြည့်နိုင်ပါတယ်။");
    return true;
  }
  if (command === "/report") {
    const target = message.reply_to_message;
    if (!target?.from?.id) { await reply("Report လုပ်ချင်တဲ့ message ကို reply လုပ်ပြီး /report [အကြောင်းရင်း] ရိုက်ပါရှင်။"); return true; }
    if (target.from.id === message.from?.id) { await reply("ကိုယ့် message ကို ကိုယ်တိုင် report လုပ်စရာ မလိုပါဘူးရှင်။"); return true; }
    const reason = args.join(" ").trim() || "အကြောင်းရင်း မဖော်ပြထားပါ";
    const targetName = target.from.username ? `@${target.from.username}` : (target.from.first_name || String(target.from.id));
    await auditAction(env, message, "user_report", target.from.id, `Reported: ${targetName}; Reason: ${reason}; Message: ${target.message_id}`);
    await reply("✅ Report ကို group admin log ထဲ ပို့ပြီးပါပြီရှင်။");
    return true;
  }
  if (command === "/purge") {
    if (!(await isAuthorizedGroupAdmin(env, message))) { await reply("ဒီ command ကို group admin သို့မဟုတ် bot admin ပဲ သုံးနိုင်ပါတယ်။"); return true; }
    const first = message.reply_to_message;
    if (!first?.message_id) { await reply("ဖျက်ချင်တဲ့ ပထမ message ကို reply လုပ်ပြီး /purge ရိုက်ပါရှင်။"); return true; }
    const start = Number(first.message_id);
    const end = Number(message.message_id);
    if (end < start || end - start > 100) { await reply("တစ်ကြိမ်မှာ message 100 ခုအထိပဲ purge လုပ်နိုင်ပါတယ်ရှင်။"); return true; }
    let deleted = 0;
    for (let id = start; id <= end; id += 1) {
      try { await telegram(env, "deleteMessage", { chat_id: message.chat.id, message_id: id }); deleted += 1; } catch {}
    }
    await auditAction(env, message, "purge", null, `${deleted} messages deleted`);
    return true;
  }
  if (command === "/poll") {
    if (!(await isAuthorizedGroupAdmin(env, message))) { await reply("ဒီ command ကို group admin သို့မဟုတ် bot admin ပဲ သုံးနိုင်ပါတယ်။"); return true; }
    const text = args.join(" ").trim();
    let question = "📚 ဒီတစ်ပတ် ဘာဖတ်ကြမလဲရှင်";
    let options = ["မြန်မာစာအုပ်", "အင်္ဂလိပ်စာအုပ်", "ဘာသာပြန်", "ကဗျာ", "သုတ/ရသ"];
    if (text.includes("|")) {
      const parts = text.split("|").map((part) => part.trim()).filter(Boolean);
      question = parts.shift() || question;
      options = parts;
    } else if (text) {
      question = text;
      options = ["ဟုတ်ပါတယ်", "မဟုတ်ပါဘူး"];
    }
    if (question.length > 300 || options.length < 2 || options.length > 10 || options.some((option) => option.length > 100)) {
      await reply("Poll မေးခွန်းက စာလုံး 300 အတွင်း၊ ရွေးချယ်စရာ 2 ခုမှ 10 ခုအတွင်း ဖြစ်ရပါမယ်ရှင်။\nဥပမာ: /poll ဘာဖတ်ကြမလဲ | ဝတ္ထု | ကဗျာ");
      return true;
    }
    try {
      await telegram(env, "sendPoll", { chat_id: message.chat.id, question, options, is_anonymous: false, allows_multiple_answers: true });
      await auditAction(env, message, "poll_created", null, question.slice(0, 300));
    } catch (error) { await reply(`❌ Poll မလုပ်နိုင်ပါဘူးရှင်။ ${escapeHtml(error?.message || "Telegram API error")}`); }
    return true;
  }
  return false;
}

function parseMuteSeconds(value) {
  const match = String(value || "1h").match(/^(\d+)(m|h|d)?$/i);
  if (!match) return 3600;
  const amount = Number(match[1]);
  return Math.min(30 * 86400, amount * ({ m: 60, h: 3600, d: 86400 }[(match[2] || "m").toLowerCase()] || 60));
}

async function moderateMember(env, message, command, args) {
  if (!isGroupMessage(message)) { await sendMessage(env, message.chat.id, "ဒီ command ကို group ထဲမှာပဲ သုံးနိုင်ပါတယ်။"); return true; }
  if (!(await isAuthorizedGroupAdmin(env, message))) { await sendMessage(env, message.chat.id, "ဒီ moderation command ကို group admin သို့မဟုတ် bot admin ပဲ သုံးနိုင်ပါတယ်။"); return true; }
  const repliedUser = message.reply_to_message?.from;
  const target = repliedUser?.id ? String(repliedUser.id) : await resolveUserId(env, args[0]);
  if (!target) { await sendMessage(env, message.chat.id, `သုံးပုံ: /${command} <Telegram ID သို့မဟုတ် @username>\nသို့မဟုတ် target user ရဲ့ message ကို reply လုပ်ပြီး /${command} ရိုက်ပါ။`); return true; }
  const durationArg = repliedUser ? args[0] : args[1];
  try {
    if (command === "ban") {
      await telegram(env, "banChatMember", { chat_id: message.chat.id, user_id: target, revoke_messages: true });
    } else if (command === "unban") {
      await telegram(env, "unbanChatMember", { chat_id: message.chat.id, user_id: target, only_if_banned: true });
    } else if (command === "kick" || command === "remove") {
      await telegram(env, "banChatMember", { chat_id: message.chat.id, user_id: target, revoke_messages: true });
      await telegram(env, "unbanChatMember", { chat_id: message.chat.id, user_id: target, only_if_banned: true });
    } else if (command === "mute") {
      const seconds = parseMuteSeconds(durationArg || "1h");
      await telegram(env, "restrictChatMember", { chat_id: message.chat.id, user_id: target, until_date: Math.floor(Date.now() / 1000) + seconds, use_independent_chat_permissions: true, permissions: { can_send_messages: false, can_send_audios: false, can_send_documents: false, can_send_photos: false, can_send_videos: false, can_send_video_notes: false, can_send_voice_notes: false, can_send_polls: false, can_send_other_messages: false, can_add_web_page_previews: false, can_change_info: false, can_invite_users: false, can_pin_messages: false } });
    } else if (command === "unmute") {
      await telegram(env, "restrictChatMember", { chat_id: message.chat.id, user_id: target, use_independent_chat_permissions: true, permissions: { can_send_messages: true, can_send_audios: true, can_send_documents: true, can_send_photos: true, can_send_videos: true, can_send_video_notes: true, can_send_voice_notes: true, can_send_polls: true, can_send_other_messages: true, can_add_web_page_previews: true, can_invite_users: true, can_pin_messages: true } });
    } else return false;
    const targetLabel = repliedUser ? userMention(repliedUser) : `<code>${escapeHtml(target)}</code>`;
    await auditAction(env, message, command, target, durationArg || "");
    await sendMessage(env, message.chat.id, `✅ <b>${escapeHtml(command)}</b> လုပ်ပြီးပါပြီရှင်။\nUser: ${targetLabel}`);
  } catch (error) {
    await sendMessage(env, message.chat.id, `❌ လုပ်မရပါ။ Bot ကို group ထဲမှာ admin ထားပြီး ban/restrict permission ပေးထားရပါမယ်။\n${escapeHtml(error?.message || "Telegram API error")}`);
  }
  return true;
}

async function serviceEvent(env, message) {
  if (!message?.chat || !isGroupMessage(message)) return;
  let action = "group_event";
  let details = "";
  if (message.new_chat_members?.length) { action = "member_joined"; details = message.new_chat_members.map((u) => u.username ? `@${u.username}` : String(u.id)).join(", "); }
  else if (message.left_chat_member) { action = "member_left"; details = message.left_chat_member.username ? `@${message.left_chat_member.username}` : String(message.left_chat_member.id); }
  else if (message.pinned_message) { action = "message_pinned"; details = `message_id=${message.pinned_message.message_id}`; }
  else if (message.delete_chat_photo) { action = "chat_photo_deleted"; }
  else if (message.new_chat_title) { action = "group_title_changed"; details = message.new_chat_title; }
  else if (message.new_chat_photo) { action = "group_photo_changed"; }
  else if (message.message_auto_delete_timer_changed) { action = "auto_delete_timer_changed"; details = `seconds=${message.message_auto_delete_timer_changed.message_auto_delete_time || 0}`; }
  else if (message.group_chat_created || message.supergroup_chat_created) { action = "group_created"; }
  else if (message.migrate_to_chat_id) { action = "group_migrated"; details = `to=${message.migrate_to_chat_id}`; }
  else if (message.migrate_from_chat_id) { action = "group_migrated"; details = `from=${message.migrate_from_chat_id}`; }
  else return;
  await auditAction(env, { ...message, from: message.from || message.left_chat_member || null }, action, null, details);
  if (message.new_chat_members?.length) await sendMembershipGreetings(env, message, "welcome");
  if (message.left_chat_member) await sendMembershipGreetings(env, message, "goodbye");
}

const WELCOME_TEXTS = [
  "🌟 <b>နွေးထွေးစွာ ကြိုဆိုပါတယ်</b>\nဒီ Group လေးမှာ ပျော်ရွှင်စွာ စာဖတ်ပြီး အသိပညာကောင်းများ ရရှိပါစေ 📚",
  "🌸 <b>ကြိုဆိုပါတယ်ရှင်</b>\nစာအုပ်ကောင်းတွေ၊ မိတ်ဆွေကောင်းတွေနဲ့ နွေးထွေးတဲ့နေရာလေး ဖြစ်ပါစေ 💜",
  "📖 <b>Welcome ပါ</b>\nဒီနေ့ကစပြီး စာဖတ်ခြင်းရဲ့ ပျော်ရွှင်မှုတွေကို အတူမျှဝေကြရအောင် ✨",
  "☀️ <b>မင်္ဂလာပါ၊ ကြိုဆိုပါတယ်</b>\nGroup ရဲ့ စာပေခရီးမှာ အမှတ်တရကောင်းတွေ ရရှိပါစေရှင် 🌈",
  "🌿 <b>နွေးနွေးထွေးထွေး ကြိုဆိုပါတယ်</b>\nစိတ်အေးချမ်းပြီး အကျိုးရှိတဲ့ စာဖတ်ချိန်များ ပိုင်ဆိုင်ပါစေ 📚",
  "💐 <b>Welcome to our reading family</b>\nဒီနေရာလေးမှာ စိတ်ချမ်းသာပြီး အမြဲကြိုဆိုခံရပါစေရှင် 😊",
  "✨ <b>မိတ်ဆွေအသစ်ကို ကြိုဆိုပါတယ်</b>\nစာအုပ်တစ်အုပ်က မိတ်ဆွေတစ်ယောက်လိုပါပဲ။ အတူတူ ရှာဖွေဖတ်ကြရအောင် 📖",
  "🌻 <b>Group ထဲကို ဝင်ရောက်လာတဲ့အတွက် ဝမ်းသာပါတယ်</b>\nကောင်းမွန်တဲ့ စာပေခရီးလေး ဖြစ်ပါစေ 💛",
  "📚 <b>စာဖတ်သူမိသားစုထဲ ကြိုဆိုပါတယ်</b>\nအတွေးသစ်၊ အသိသစ်နဲ့ နေ့ရက်ကောင်းများ ရရှိပါစေရှင် 🌼",
  "🎉 <b>Welcome ပါရှင်</b>\nGroup လေးရဲ့ နွေးထွေးမှုနဲ့ စာအုပ်ကောင်းများကို ခံစားနိုင်ပါစေ 💫",
  "🌙 <b>မိတ်ဆွေအသစ်ကို လှိုက်လှဲစွာ ကြိုဆိုပါတယ်</b>\nဖတ်ရှုမှုတိုင်းက ပျော်ရွှင်မှုဖြစ်ပါစေ 📖",
  "💙 <b>ကြိုဆိုပါတယ်</b>\nမေးချင်တာမေး၊ ဖတ်ချင်တာဖတ်၊ မျှဝေချင်တာမျှဝေပြီး အတူတူ တိုးတက်ကြရအောင် 🌱",
  "🌈 <b>Welcome လို့ ပြောလိုက်ပါတယ်</b>\nဒီ Group မှာ ကောင်းမွန်တဲ့ မိတ်ဆွေတွေနဲ့ တွေ့ဆုံနိုင်ပါစေရှင် ✨",
  "🍀 <b>မင်္ဂလာပါ၊ အားလုံးက ကြိုဆိုနေပါတယ်</b>\nစာဖတ်ခြင်းကနေ အားအင်နဲ့ အလင်းရောင် ရရှိပါစေ 📚",
  "🌷 <b>နွေးထွေးစွာ ကြိုဆိုပါတယ်</b>\nဒီနေ့မှစပြီး ကောင်းမွန်တဲ့ စာအုပ်အဖော်တွေ ရရှိပါစေရှင် 💗",
  "🕊️ <b>Welcome ပါ</b>\nစိတ်အေးချမ်းမှုနဲ့ အသိပညာကောင်းတွေ ဒီ Group ထဲမှာ အမြဲရှိပါစေ 📖",
  "⭐ <b>အသစ်ရောက်လာတဲ့ မိတ်ဆွေကို ကြိုဆိုပါတယ်</b>\nစာပေချစ်သူတို့ရဲ့ နေရာလေးမှာ ပျော်ရွှင်ပါစေ 🌟",
  "☕ <b>မင်္ဂလာပါရှင်</b>\nကော်ဖီတစ်ခွက်နဲ့ စာအုပ်ကောင်းတစ်အုပ်လို နွေးထွေးတဲ့ Group ဖြစ်ပါစေ ☕📚",
  "🌺 <b>ဝမ်းမြောက်စွာ ကြိုဆိုပါတယ်</b>\nအတူဖတ်၊ အတူမျှဝေ၊ အတူတိုးတက်ကြရအောင်ရှင် 💐",
  "📚 <b>စာပေမိတ်ဆွေသစ်ကို ကြိုဆိုပါတယ်</b>\nဒီ Group ထဲက နေ့ရက်တိုင်း အဓိပ္ပာယ်ရှိပါစေ ✨",
];

const GOODBYE_TEXTS = [
  "🌙 <b>သွားတော့မယ့် မိတ်ဆွေကို နှုတ်ဆက်ပါတယ်</b>\nရှေ့ဆက်မယ့် ခရီးလမ်းမှာ ကောင်းခြင်းများနဲ့ တွေ့ပါစေရှင် 💜",
  "🌿 <b>Goodbye ပါရှင်</b>\nအတူရှိခဲ့တဲ့အချိန်တွေအတွက် ကျေးဇူးတင်ပါတယ်။ နောက်တစ်ချိန် ပြန်တွေ့ကြပါစေ 📚",
  "🌸 <b>နှုတ်ဆက်ပါတယ်</b>\nဘယ်နေရာရောက်ရောက် စိတ်ချမ်းသာပြီး အောင်မြင်ပါစေရှင် 🌸",
  "✨ <b>သွားတဲ့လမ်းမှာ အဆင်ပြေပါစေ</b>\nဒီ Group က မိတ်ဆွေကောင်းတွေကို မမေ့ပါဘူးနော် 💫",
  "☀️ <b>Goodbye နဲ့ အကောင်းဆုံးဆုတောင်းပေးပါတယ်</b>\nနေ့ရက်တိုင်း လှပပြီး ပျော်ရွှင်ပါစေ 📖",
  "🌈 <b>နှုတ်ဆက်ပါတယ် မိတ်ဆွေ</b>\nဘဝစာမျက်နှာသစ်တိုင်းမှာ ကောင်းသောအရာတွေ ပြည့်ပါစေ 🌈",
  "💐 <b>ခဏတာခွဲခွာရပေမယ့် အမှတ်တရကောင်းတွေ ကျန်ခဲ့ပါတယ်</b>\nကောင်းမွန်တဲ့နေ့ရက်များ ရရှိပါစေရှင် 💐",
  "📚 <b>မိတ်ဆွေကို နွေးထွေးစွာ နှုတ်ဆက်ပါတယ်</b>\nစာအုပ်ကောင်းတွေနဲ့ အမြဲတွေ့ဆုံနိုင်ပါစေ 📖",
  "🕊️ <b>သွားတော့မယ့် မိတ်ဆွေကို ဆုမွန်ကောင်းတောင်းပါတယ်</b>\nစိတ်အေးချမ်းပြီး လမ်းခရီးဖြောင့်ဖြူးပါစေရှင် 🕊️",
  "🌻 <b>Goodbye ပါ</b>\nအတူရှိခဲ့တဲ့အချိန်တွေက အမြဲတမ်း လှပတဲ့အမှတ်တရ ဖြစ်နေပါစေ 🌻",
  "💙 <b>နှုတ်ဆက်ပါတယ်ရှင်</b>\nပြန်ဆုံနိုင်မယ့်နေ့အထိ ကျန်းမာပျော်ရွှင်ပါစေ 💙",
  "⭐ <b>မိတ်ဆွေကို ချစ်ခြင်းနဲ့ နှုတ်ဆက်ပါတယ်</b>\nနောက်ထပ်တွေ့မယ့်နေရာတိုင်းမှာ အောင်မြင်ပါစေ ⭐",
];

async function nextGreeting(env, chatId, kind, pool) {
  const row = await env.DB.prepare("SELECT last_index FROM greeting_state WHERE chat_id=? AND kind=?").bind(chatId, kind).first();
  const next = (Number(row?.last_index ?? -1) + 1) % pool.length;
  await env.DB.prepare("INSERT OR REPLACE INTO greeting_state(chat_id,kind,last_index) VALUES(?,?,?)").bind(chatId, kind, next).run();
  return pool[next];
}

async function sendTemporaryMembershipMessage(env, chatId, text) {
  const sent = await sendMessage(env, chatId, text);
  if (sent.result?.message_id) await deleteAfterDelay(env, chatId, sent.result.message_id, 5000);
}

async function sendMembershipGreetings(env, message, kind) {
  const members = kind === "welcome" ? message.new_chat_members || [] : [message.left_chat_member];
  for (const member of members) {
    if (!member?.id) continue;
    const label = `<a href="tg://user?id=${member.id}">${escapeHtml([member.first_name, member.last_name].filter(Boolean).join(" ") || member.username || "မိတ်ဆွေ")}</a>`;
    const text = await nextGreeting(env, message.chat.id, kind, kind === "welcome" ? WELCOME_TEXTS : GOODBYE_TEXTS);
    await sendTemporaryMembershipMessage(env, message.chat.id, `${label}\n${text}`);
  }
}

async function handleJoinRequest(env, request) {
  const chat = request.chat;
  const user = request.from;
  if (!chat || !user) return;
  await rememberChat(env, chat);
  const message = { chat, from: user };
  try {
    console.log("Join request received", chat.id, user.id, user.username || user.first_name || "unknown");
    await telegram(env, "approveChatJoinRequest", { chat_id: chat.id, user_id: user.id });
    await auditAction(env, message, "join_request_auto_approved", user.id, `${user.username || user.first_name || "unknown"}`);
  } catch (error) {
    console.error("Join request handling failed", error?.message || "unknown error");
    await auditAction(env, message, "join_request_error", user.id, error?.message || "Telegram API error");
  }
}

async function membershipEvent(env, update, kind = "member_status_changed") {
  const event = update.chat_member || update.my_chat_member;
  if (!event?.chat || !isGroupChat(event.chat)) return;
  await rememberChat(env, event.chat);
  const oldStatus = event.old_chat_member?.status || "unknown";
  const newStatus = event.new_chat_member?.status || "unknown";
  const target = event.new_chat_member?.user;
  const targetId = target?.id || null;
  let action = kind;
  let details = `${oldStatus} → ${newStatus}`;
  if (kind === "bot_status_changed") {
    action = ["left", "kicked"].includes(newStatus) ? "bot_removed" : "bot_status_changed";
    details = `Bot status: ${oldStatus} → ${newStatus}`;
  } else if (newStatus === "administrator") {
    action = "admin_promoted";
    details = `${target?.username ? `@${target.username}` : targetId} promoted to administrator`;
  } else if (oldStatus === "administrator" && newStatus !== "administrator") {
    action = "admin_demoted";
    details = `${target?.username ? `@${target.username}` : targetId} demoted from administrator`;
  } else if (newStatus === "restricted") {
    action = "member_restricted";
    details = `${target?.username ? `@${target.username}` : targetId} restricted`;
  } else if (oldStatus === "restricted" && newStatus === "member") {
    action = "member_unrestricted";
    details = `${target?.username ? `@${target.username}` : targetId} unrestricted`;
  }
  await auditAction(env, { chat: event.chat, from: event.from }, action, targetId, details);
}

function isServiceMessage(message) {
  return Boolean(message?.new_chat_members?.length || message?.left_chat_member || message?.pinned_message || message?.delete_chat_photo || message?.group_chat_created || message?.supergroup_chat_created || message?.new_chat_title || message?.new_chat_photo || message?.migrate_to_chat_id || message?.migrate_from_chat_id || message?.message_auto_delete_timer_changed);
}

async function deleteAfterDelay(env, chatId, messageId, milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
  try { await telegram(env, "deleteMessage", { chat_id: chatId, message_id: messageId }); } catch (error) { console.log("Delayed delete skipped", error?.message || "unknown error"); }
}

function telegramPathAllowed(url) {
  const match = String(url || "").match(/(?:https?:\/\/)?(?:www\.)?t\.me\/([^\s/?#]+)/i);
  return Boolean(match && match[1].toLowerCase() === "thebookr");
}

function linkAllowed(url) {
  try {
    const parsed = new URL(String(url).trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch") return true;
    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return true;
    if (host === "twitter.com" || host.endsWith(".twitter.com") || host === "x.com" || host.endsWith(".x.com")) return true;
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return true;
    if (host === "saroatsin.com" || host.endsWith(".saroatsin.com")) return true;
    if (host === "whispermmepub.github.io" && parsed.pathname.toLowerCase().startsWith("/review/")) return true;
    return telegramPathAllowed(url);
  } catch {
    return false;
  }
}

function forwardedChat(message) {
  return message?.forward_origin?.chat || message?.forward_from_chat || null;
}

async function hasGroupAdminPrivilege(env, message) {
  if (message.sender_chat?.id && String(message.sender_chat.id) === String(message.chat?.id)) return true;
  if (await isBotAdmin(env, message.from)) return true;
  try {
    const status = (await telegram(env, "getChatMember", { chat_id: message.chat.id, user_id: message.from.id })).result?.status;
    return ["administrator", "creator"].includes(status);
  } catch { return false; }
}

async function enforceForwardPolicy(env, message) {
  if (!isGroupMessage(message) || !message.from || await hasGroupAdminPrivilege(env, message)) return false;
  const origin = forwardedChat(message);
  const originUsername = String(origin?.username || "").toLowerCase();
  const text = `${message.text || ""}\n${message.caption || ""}`;
  const links = text.match(/https?:\/\/[^\s<>()]+/gi) || [];
  const telegramLinks = links.filter((link) => /(?:https?:\/\/)?(?:www\.)?t\.me\//i.test(link));
  const fromOtherChat = Boolean(origin && originUsername !== "thebookr");
  const hasOtherTelegramLink = telegramLinks.some((link) => !telegramPathAllowed(link));
  const hasDisallowedLink = links.some((link) => !linkAllowed(link));
  const allowedBookRForward = Boolean(origin && originUsername === "thebookr");
  if (allowedBookRForward || (!fromOtherChat && !hasOtherTelegramLink && !hasDisallowedLink)) return false;
  try { await telegram(env, "deleteMessage", { chat_id: message.chat.id, message_id: message.message_id }); } catch (error) { console.log("Policy delete failed", error?.message || "unknown error"); }
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT INTO forward_violations(group_chat_id,user_id,count,last_violation) VALUES(?,?,1,?) ON CONFLICT(group_chat_id,user_id) DO UPDATE SET count=count+1,last_violation=excluded.last_violation")
    .bind(message.chat.id, message.from.id, now).run();
  const violation = await env.DB.prepare("SELECT count FROM forward_violations WHERE group_chat_id=? AND user_id=?").bind(message.chat.id, message.from.id).first();
  const count = Number(violation?.count || 1);
  const userLabel = message.from.username ? `@${message.from.username}` : `<a href="tg://user?id=${message.from.id}">${message.from.first_name || "User"}</a>`;
  await auditAction(env, message, "unauthorized_forward_deleted", message.from.id, `${count}/4`);
  if (count >= 4) {
    try {
      await telegram(env, "banChatMember", { chat_id: message.chat.id, user_id: message.from.id, revoke_messages: true });
      await telegram(env, "unbanChatMember", { chat_id: message.chat.id, user_id: message.from.id, only_if_banned: true });
      await auditAction(env, message, "user_removed_after_four_violations", message.from.id, "four-strike forward policy");
      await sendMessage(env, message.chat.id, `🚫 ${userLabel} ကို ခွင့်မပြုထားတဲ့ Telegram forward ${count} ကြိမ်ကြောင့် group မှ ဖယ်ရှားလိုက်ပါပြီ။`);
    } catch (error) { console.log("Four-strike removal failed", error?.message || "unknown error"); }
  } else {
    await sendMessage(env, message.chat.id, `⚠️ ${userLabel} ခွင့်မပြုထားတဲ့ Telegram channel/group link သို့မဟုတ် forward ဖြစ်လို့ ဖျက်လိုက်ပါတယ်။\nသတိပေးချက်: <b>${count}/4</b>\n4 ကြိမ်ပြည့်ရင် group မှ ဖယ်ရှားပါမယ်။\nခွင့်ပြုထားသော channel: https://t.me/TheBookR`);
  }
  return true;
}

async function handleCommand(env, message) {
  const text = String(message.text || "").trim();
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const query = args.join(" ").trim();
  const chatId = message.chat.id;
  const cleanup = isGroupMessage(message) ? { __deleteAfterSeconds: resultDeleteSeconds(env) } : {};
  const reply = (text, extra = {}) => sendMessage(env, chatId, text, { ...cleanup, ...extra });
  if (await handleGuardianCommand(env, message, command, args, reply)) return null;
  if (command === "/start" || command === "/help") {
    return reply("<b>📚 စာအုပ်ရှာဖွေရေး Bot</b>\n\nအောက်က menu ကနေ ရွေးနိုင်ပါတယ်ရှင်။", { reply_markup: { inline_keyboard: [
      [{ text: "🔎 စာအုပ်ရှာမယ်", callback_data: "help_search" }, { text: "✍️ စာရေးသူများ", callback_data: "help_authors" }],
      [{ text: "📚 စာအုပ်များ", callback_data: "help_books" }, { text: "📊 အခြေအနေ", callback_data: "help_stats" }],
    ] } });
  }
  if (command === "/add") {
    if (message.chat.type !== "private" || !(await isAdmin(env, message.from))) return reply("ဒီ command ကို owner admin က private DM မှာပဲ သုံးနိုင်ပါတယ်။");
    const target = await resolveUserId(env, args[0]);
    if (!target) return reply("သုံးပုံ: /add <Telegram ID သို့မဟုတ် @username>\nUsername ကိုရှာရန် အဲဒီ user က bot ကို အရင် message ပို့ထားရပါမယ်။");
    await env.DB.prepare("INSERT OR REPLACE INTO bot_admins(user_id,username,added_by,created_at) VALUES(?,?,?,?)").bind(target, String(args[0] || "").replace(/^@/, ""), message.from.id, Math.floor(Date.now() / 1000)).run();
    return reply(`✅ Bot admin ထည့်ပြီးပါပြီ။\nUser: <code>${escapeHtml(target)}</code>`);
  }
  if (command === "/admins") {
    if (message.chat.type !== "private" || !(await isAdmin(env, message.from))) return reply("ဒီ command ကို owner admin က private DM မှာပဲ သုံးနိုင်ပါတယ်။");
    const rows = await env.DB.prepare("SELECT user_id,username FROM bot_admins ORDER BY created_at").all();
    const list = (rows.results || []).map((row, index) => `${index + 1}. <code>${row.user_id}</code>${row.username ? ` @${escapeHtml(row.username)}` : ""}`).join("\n");
    return reply(`<b>Bot Admin များ</b>\nOwner: <code>${escapeHtml(adminId(env))}</code>${list ? `\n${list}` : "\nထပ်ထည့်ထားတဲ့ admin မရှိသေးပါ။"}`);
  }
  if (["ban", "unban", "kick", "remove", "mute", "unmute"].includes(command)) {
    if (await moderateMember(env, message, command.slice(1), args)) return null;
  }
  if (command === "/setlog") {
    if (!(await isAuthorizedGroupAdmin(env, message))) return reply("ဒီ command ကို group admin သို့မဟုတ် bot admin ပဲ သုံးနိုင်ပါတယ်။");
    const logTarget = args[0];
    if (!logTarget) return reply("သုံးပုံ: /setlog <log channel @username သို့မဟုတ် ID>");
    try {
      const normalizedTarget = normalizeChatTarget(logTarget);
      const logChat = (await telegram(env, "getChat", { chat_id: normalizedTarget })).result;
      await env.DB.prepare("INSERT OR REPLACE INTO log_configs(group_chat_id,log_chat_id,configured_by,created_at) VALUES(?,?,?,?)").bind(message.chat.id, logChat.id, message.from.id, Math.floor(Date.now() / 1000)).run();
      await auditAction(env, message, "log_channel_connected", null, `log_chat_id=${logChat.id}`);
      return reply(`✅ Log channel ချိတ်ပြီးပါပြီ။\n${escapeHtml(logChat.title || logChat.username || String(logChat.id))}`);
    } catch (error) {
      return reply(`❌ Log channel မချိတ်နိုင်ပါ။\n• Public channel ဆိုရင် Bot ကို admin ထည့်ပြီး Post Messages permission ပေးပါ။\n• Private channel ဆိုရင် numeric channel ID (-100...) သုံးပါ။\n• သင်ထည့်ထားတဲ့ URL ကိုလည်း လက်ခံနိုင်ပါပြီ။\n${escapeHtml(error?.message || "Telegram API error")}`);
    }
  }
  if (command === "/unsetlog") {
    if (!(await isAuthorizedGroupAdmin(env, message))) return reply("ဒီ command ကို group admin သို့မဟုတ် bot admin ပဲ သုံးနိုင်ပါတယ်။");
    await env.DB.prepare("DELETE FROM log_configs WHERE group_chat_id=?").bind(message.chat.id).run();
    return reply("✅ Log channel ချိတ်ဆက်မှု ဖြုတ်ပြီးပါပြီ။");
  }
  if (command === "/history") {
    if (!(await isAuthorizedGroupAdmin(env, message))) return reply("ဒီ command ကို group admin သို့မဟုတ် bot admin ပဲ သုံးနိုင်ပါတယ်။");
    const rows = await env.DB.prepare("SELECT action,target_id,details,created_at FROM action_logs WHERE group_chat_id=? ORDER BY id DESC LIMIT 30").bind(message.chat.id).all();
    const list = (rows.results || []).map((row, index) => `${index + 1}. <b>${escapeHtml(row.action)}</b>${row.target_id ? ` — <code>${escapeHtml(row.target_id)}</code>` : ""}${row.details ? `\n${escapeHtml(row.details)}` : ""}`).join("\n\n");
    return reply(`<b>🛡 Recent Admin History</b>\n${list || "မှတ်တမ်း မရှိသေးပါ။"}`);
  }
  if (command === "/search" || command === "/find") {
    return query ? sendSearch(env, chatId, query, cleanup, false, { user: message.from, chatType: message.chat?.type }) : reply("သုံးပုံ: /search စာအုပ်နာမည် သို့မဟုတ် စာရေးသူ");
  }
  if (command === "/connects") {
    if (message.chat.type !== "private" || !(await isAdmin(env, message.from))) return reply("ဒီ command ကို admin က private DM မှာပဲ သုံးနိုင်ပါတယ်။");
    const groups = await connectedGroups(env);
    if (!groups.length) return reply("Bot သုံးနေတဲ့ group မတွေ့သေးပါ။ Bot က group ထဲမှာ message/update တစ်ခုခု ရရှိပြီးမှ စာရင်းထဲဝင်ပါမယ်။");
    const lines = [`<b>🔗 Bot ချိတ်ထားတဲ့ Group များ (${groups.length})</b>`];
    const buttons = [];
    groups.forEach((group, index) => {
      const role = group.status === "administrator" || group.status === "creator" ? "Admin" : "Member";
      lines.push(`${index + 1}. <b>${escapeHtml(group.title)}</b> — ${role}${group.link ? "" : " — link မရနိုင်ပါ"}`);
      if (group.link) buttons.push([{ text: `🔗 ${String(group.title).slice(0, 55)}`, url: group.link }]);
    });
    return reply(lines.join("\n"), buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {});
  }
  if (command === "/ask") {
    if (!query) return reply("သုံးပုံ: /ask စာအုပ်နာမည်");
    const local = await localReviewMatches(env, query);
    const reviews = local.length ? local : await reviewMatches(query);
    return sendReviews(env, chatId, query, reviews, cleanup);
  }
  if (command === "/author") return handleCommand(env, { ...message, text: "/authors" });
  if (command === "/myid") {
    return reply(`Your Telegram ID: <code>${escapeHtml(message.from?.id || "မသိပါ")}</code>\nUsername: ${message.from?.username ? `@${escapeHtml(message.from.username)}` : "(မရှိပါ)"}`);
  }
  if (command === "/reset") return reply("စကားဝိုင်းမှတ်တမ်း မသိမ်းထားတဲ့ catalog bot ဖြစ်လို့ reset လုပ်စရာ မရှိပါ။");
  if (command === "/allow" || command === "/remove") {
    if (!(await isAdmin(env, message.from))) return reply("ဒီ command ကို admin ပဲ သုံးနိုင်ပါတယ်။");
    const target = await resolveUserId(env, args[0]);
    if (!target) return reply(`သုံးပုံ: ${command} <Telegram ID> သို့မဟုတ် @username\nUser က bot ကို အရင် message ပို့ပြီး /myid နဲ့ ID ကြည့်နိုင်ပါတယ်။`);
    if (command === "/allow") {
      await env.DB.prepare("INSERT OR REPLACE INTO allowed_users(user_id,username,created_at) VALUES(?,?,datetime('now'))").bind(target, String(args[0] || "").replace(/^@/, "")).run();
      return reply(`Allowed user: <code>${escapeHtml(target)}</code>`);
    }
    if (target === adminId(env)) return reply("Admin ကို remove လုပ်လို့မရပါ။");
    await env.DB.prepare("DELETE FROM allowed_users WHERE user_id=?").bind(target).run();
    return reply(`Removed user: <code>${escapeHtml(target)}</code>`);
  }
  if (command === "/authors") {
    return catalogPage(env, chatId, "authors", 0, cleanup);
  }
  if (command === "/books") {
    return catalogPage(env, chatId, "books", 0, cleanup);
  }
  if (command === "/stats") {
    const rows = await env.DB.prepare("SELECT chat_id,author,raw_text FROM books").all();
    const catalogRows = (rows.results || []).filter((row) => !isReviewRecord(row));
    const authors = new Set(catalogRows.map((row) => String(row.author || "").trim()).filter(Boolean));
    return reply(`<b>📊 Catalog စာရင်းအခြေအနေ</b>\n\n📚 စာအုပ်စုစုပေါင်း: <b>${catalogRows.length}</b> အုပ်\n✍️ စာရေးသူစုစုပေါင်း: <b>${authors.size}</b> ဦး`);
  }
  return null;
}

async function handleMessage(env, message) {
  const text = String(message.text || "").trim();
  if (!text) return;
  await Promise.all([rememberChat(env, message.chat), rememberUser(env, message.from)]);
  if (text.startsWith("/")) return handleCommand(env, message);
  const isGroup = ["group", "supergroup"].includes(message.chat?.type);
  const replyTarget = message.reply_to_message;
  let botMentioned = false;
  if (isGroup && message.entities?.some((entity) => entity.type === "mention")) {
    try {
      const botUsername = (await getBotIdentity(env)).username;
      botMentioned = Boolean(botUsername && text.toLowerCase().includes(`@${String(botUsername).toLowerCase()}`));
    } catch (error) {
      console.log("Bot mention check failed", error?.message || "unknown error");
    }
  }
  if (isGroup && replyTarget?.from && !replyTarget.from.is_bot && !botMentioned) return;
  const cleanup = isGroupMessage(message) ? { __deleteAfterSeconds: resultDeleteSeconds(env) } : {};
  if (isGroup && !botMentioned) {
    // Do not fuzzy-search every ordinary group message. The original bot
    // only searched an exact author/title in this fast path, and stayed
    // silent when there was no exact catalog match.
    const exactRows = await searchExactBook(env, text);
    if (!exactRows.length) return null;
    return sendSearch(env, message.chat.id, text, cleanup, true, { user: message.from, chatType: message.chat?.type }, exactRows);
  }
  return sendSearch(env, message.chat.id, text, cleanup, false, { user: message.from, chatType: message.chat?.type });
}

async function handleCallback(env, query) {
  await telegram(env, "answerCallbackQuery", { callback_query_id: query.id });
  const action = query.data;
  const message = query.message;
  if (!message) return;
  await rememberChat(env, message.chat);
  if (action === "help_search") return sendMessage(env, message.chat.id, "သုံးပုံ: /search စာအုပ်နာမည် သို့မဟုတ် စာရေးသူ");
  if (action === "help_authors") return handleCommand(env, { chat: message.chat, text: "/authors" });
  if (action === "help_books") return handleCommand(env, { chat: message.chat, text: "/books" });
  if (action === "help_stats") return handleCommand(env, { chat: message.chat, text: "/stats" });
  const searchMatch = String(action || "").match(/^search:([a-z0-9]+):(\d+)$/);
  if (searchMatch) {
    const session = await env.DB.prepare("SELECT query FROM search_sessions WHERE token=? AND created_at>? ").bind(searchMatch[1], Math.floor(Date.now() / 1000) - 86400).first();
    if (!session) return sendMessage(env, message.chat.id, "ဒီရှာဖွေမှု button သက်တမ်းကုန်သွားပါပြီ။ ပြန်ရှာပါ။");
    const stored = String(session.query || "");
    let query;
    let exact;
    let mention = "";
    let introIndex = 0;
    try {
      const parsed = JSON.parse(stored);
      query = String(parsed.query || "");
      exact = Boolean(parsed.exact);
      mention = String(parsed.mention || "");
      introIndex = Number(parsed.introIndex) || 0;
    } catch {
      exact = stored.startsWith("__exact__");
      query = stored.replace(/^__(?:exact|fuzzy)__/, "");
    }
    return sendSearchPage(env, message.chat.id, query, Number(searchMatch[2]), {}, exact, searchMatch[1], message.message_id, mention, introIndex);
  }
  const catalogMatch = String(action || "").match(/^catalog:(authors|books):(\d+)$/);
  if (catalogMatch) return catalogPage(env, message.chat.id, catalogMatch[1], Number(catalogMatch[2]), {}, message.message_id);
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(Promise.all([ensureWebhook(env), cleanupDue(env), sendMorningGreetings(env), pruneWebhookUpdates(env)]));
  },

  async fetch(request, env, ctx) {
    try {
      if (new URL(request.url).pathname === "/health") {
        return new Response(`Worker OK; Telegram API: ${await telegramHealth(env)}; Webhook: ${await webhookHealth(env)}`);
      }
      if (request.method === "GET") return new Response("gemini-telegram-webhook is running");
      if (env.TELEGRAM_SECRET_TOKEN && request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_SECRET_TOKEN) return new Response("Unauthorized", { status: 401 });
      const update = await request.json();
      if (!(await claimWebhookUpdate(env, update.update_id))) return new Response("OK");
      if (update.channel_post) {
        ctx.waitUntil(rememberChat(env, update.channel_post.chat));
        ctx.waitUntil(importChannelPost(env, update.channel_post).catch((error) => console.error("Channel import failed", error?.message || "unknown error")));
      } else if (update.callback_query) {
        ctx.waitUntil(handleCallback(env, update.callback_query).catch((error) => console.error("Callback failed", error?.message || "unknown error")));
      } else if (update.chat_join_request) {
        ctx.waitUntil(handleJoinRequest(env, update.chat_join_request).catch((error) => console.error("Join request failed", error?.message || "unknown error")));
      } else if (update.chat_member) {
        ctx.waitUntil(membershipEvent(env, update, "member_status_changed").catch((error) => console.error("Chat member audit failed", error?.message || "unknown error")));
      } else if (update.my_chat_member) {
        ctx.waitUntil(membershipEvent(env, update, "bot_status_changed").catch((error) => console.error("Bot status audit failed", error?.message || "unknown error")));
      } else if (update.edited_message) {
        ctx.waitUntil(auditAction(env, update.edited_message, "message_edited", null, `message_id=${update.edited_message.message_id}`).catch((error) => console.error("Edit audit failed", error?.message || "unknown error")));
      } else if (update.message) {
        const message = update.message;
        ctx.waitUntil(rememberChat(env, message.chat));
        if (isGroupMessage(message) && isServiceMessage(message)) {
          ctx.waitUntil(deleteAfterDelay(env, message.chat.id, message.message_id, 2000));
        }
        ctx.waitUntil(enforceForwardPolicy(env, message).then(async (blocked) => {
          if (blocked) return null;
          if (message.text) {
            if (isGroupMessage(message) && autoDeleteEnabled(env) && message.text.trim().startsWith("/")) {
              await queueDelete(env, message.chat.id, message.message_id, commandDeleteSeconds(env));
            }
            return handleMessage(env, message);
          }
          return serviceEvent(env, message);
        }).catch((error) => console.error("Message handling failed", error?.message || "unknown error")));
      }
      return new Response("OK");
    } catch (error) {
      console.error(error);
      return new Response("OK");
    }
  },
};
