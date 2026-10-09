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
const lastNoResult = new Map();
const lastPdfNote = new Map();
const chatWriteCache = new Map();
const userWriteCache = new Map();
const searchThrottle = new Map();
const searchSessionCache = new Map();
let botIdentityCache = null;
let bookRowsCache = null;
let bookSearchEntriesCache = null;
let bookRowsCacheAt = 0;

function nextSearchIntro(chatId) {
  const previous = lastSearchIntro.get(String(chatId));
  const choices = SEARCH_INTROS.map((_, index) => index).filter((index) => index !== previous);
  const index = choices[Math.floor(Math.random() * choices.length)] ?? 0;
  lastSearchIntro.set(String(chatId), index);
  if (lastSearchIntro.size > 500) lastSearchIntro.delete(lastSearchIntro.keys().next().value);
  return index;
}

const NO_RESULT_RESPONSES = [
  "ဒီနာမည်နဲ့တော့ catalog ထဲမှာ မတွေ့သေးပါဘူးရှင်။ စာလုံးပေါင်းလေး ပြန်စစ်ပြီး ထပ်မေးကြည့်ပေးပါနော်။",
  "ရှာပေးကြည့်တာ ဒီတစ်ခါတော့ မတွေ့သေးဘူးရှင်။ စာရေးသူနာမည်ပဲဖြစ်ဖြစ်၊ စာအုပ်နာမည်ပဲဖြစ်ဖြစ် တစ်မျိုးစီနဲ့ မေးကြည့်လို့ရပါတယ်နော်။",
  "အခုရှိတဲ့ စာအုပ်စာရင်းထဲမှာ ဒီနာမည်လေး မပါသေးပါဘူးရှင်။ နာမည်အပြည့်အစုံ ဒါမှမဟုတ် စာလုံးနည်းနည်းနဲ့ ထပ်ရှာပေးနိုင်ပါတယ်နော်။",
  "ဒီစာအုပ်/စာရေးသူကို ရှာမတွေ့သေးပါဘူးရှင်။ စာလုံးပေါင်းတစ်ချက် ပြန်စစ်ပေးမလားနော်။",
  "မတွေ့သေးလို့ စိတ်မကောင်းပါဘူးရှင်။ နာမည်ရဲ့ တစ်စိတ်တစ်ပိုင်းလေးနဲ့ ထပ်ရှာကြည့်ပေးပါမယ်နော်။",
  "ဒီတစ်ခါတော့ ရလဒ်မထွက်သေးပါဘူးရှင်။ ရေးသားပုံနည်းနည်းပြောင်းပြီး ထပ်မေးကြည့်ပါနော်။",
  "Catalog ထဲမှာ ဒီနာမည်ကို မတွေ့ရသေးပါဘူးရှင်။ စာရေးသူနာမည်နဲ့ သီးသန့်ရှာကြည့်ရင်လည်း ရပါတယ်နော်။",
  "ရှာပေးထားပေမယ့် ဒီနာမည်နဲ့ စာအုပ် မတွေ့သေးပါဘူးရှင်။ နာမည်နည်းနည်းကွဲနေတာ ဖြစ်နိုင်လို့ ပြန်မေးကြည့်ပေးပါနော်။",
  "ဒီနာမည်လေးကို catalog ထဲမှာ မတွေ့သေးဘူးရှင်။ ထည့်သွင်းထားတဲ့ စာရင်းထဲ မပါသေးတာလည်း ဖြစ်နိုင်ပါတယ်နော်။",
  "အခုလက်ရှိစာရင်းနဲ့တော့ မတွေ့သေးပါဘူးရှင်။ အခြားစာလုံးပေါင်းပုံနဲ့ ရှာပေးရမလား ပြောပါနော်။",
  "ဒီစာအုပ်လေးကို မတွေ့သေးပါဘူးရှင်။ စာအုပ်နာမည်နဲ့ စာရေးသူနာမည်ကို ခွဲပြီး ထပ်မေးကြည့်ပါနော်။",
  "ရှာကြည့်ပြီးပါပြီရှင်၊ ဒီနာမည်နဲ့ ကိုက်ညီတာ မတွေ့သေးပါဘူး။ နာမည်အတိုလေးနဲ့ ထပ်စမ်းကြည့်လို့ရပါတယ်နော်။",
];

function nextNoResult(chatId) {
  const key = String(chatId);
  const previous = lastNoResult.get(key);
  const choices = NO_RESULT_RESPONSES.map((_, index) => index).filter((index) => index !== previous);
  const index = choices[Math.floor(Math.random() * choices.length)] ?? 0;
  lastNoResult.set(key, index);
  if (lastNoResult.size > 500) lastNoResult.delete(lastNoResult.keys().next().value);
  return NO_RESULT_RESPONSES[index];
}

const PDF_NOTES = [
  "PDF ဖိုင်တော့ မလုပ်ပေးထားဘူးရှင်။ ဒီစာအုပ်အတွက် EPUB ဖိုင်ပဲ ရှိပါတယ်နော်။ အောက်ကခလုတ်လေးကနေ ဖွင့်ကြည့်လို့ရပါတယ်ရှင်။",
  "ဒီစာအုပ်ကို PDF အနေနဲ့ မတင်ထားပါဘူးရှင်။ EPUB ဖိုင်ရှိလို့ အောက်က link လေးကနေ ရယူဖတ်ရှုနိုင်ပါတယ်နော်။",
  "PDF မဟုတ်ဘဲ EPUB format နဲ့ပဲ စီစဉ်ပေးထားပါတယ်ရှင်။ စာအုပ်ကို အောက်ကခလုတ်ကနေ ဖွင့်ကြည့်လို့ရပါတယ်နော်။",
  "မေးထားတဲ့စာအုပ် ရှိပါတယ်ရှင်။ PDF မလုပ်ထားဘဲ EPUB ဖိုင်ပဲ ပြင်ဆင်ထားတာပါနော်။",
  "ဒီစာအုပ်အတွက် ရှိထားတဲ့ဖိုင်က EPUB ဖိုင်ပါရှင်။ PDF version မရှိသေးပါဘူးနော်။ အောက်မှာ link ထည့်ပေးထားပါတယ်။",
];

function nextPdfNote(chatId) {
  const key = String(chatId);
  const previous = lastPdfNote.get(key);
  const choices = PDF_NOTES.map((_, index) => index).filter((index) => index !== previous);
  const index = choices[Math.floor(Math.random() * choices.length)] ?? 0;
  lastPdfNote.set(key, index);
  if (lastPdfNote.size > 500) lastPdfNote.delete(lastPdfNote.keys().next().value);
  return PDF_NOTES[index];
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

function extractNaturalSearchQuery(text) {
  const original = String(text || "").trim();
  if (!original || original.startsWith("/")) return null;
  const compact = normalize(original);
  const looksLikeBookQuestion = /စာအုပ်|စာရင်း|epub|pdf|file|ဖိုင်|ရှိလား|ရှိလဲ|ရှိသလား|ရှိပါသလား|ရှိမလား|ရှိမရှိ|ရနိုင်မလား|ရမလား|ရှာပေး|ရှာပါ|ရှာချင်|လိုချင်|ဘယ်နှအုပ်|ဘယ်လောက်|အရေအတွက်|ဘယ်စာအုပ်|ရှိသလောက်|ပြပေး/.test(compact);
  if (!looksLikeBookQuestion) return null;
  let query = original
    .replace(/^\s*(?:ဆရာမကြီး|ဆရာကြီး|ဆရာမ|ဆရာ|ဒေါက်တာ|ဦး|ဒေါ်)\s*/gu, "")
    .replace(/(?:စာအုပ်နာမည်|စာအုပ်အမည်|စာအုပ်လေးတွေ|စာအုပ်လေး|စာအုပ်တွေ|စာအုပ်များ|စာအုပ်|epub|pdf|file|ဖိုင်|လေး)/giu, " ")
    .replace(/(?:ခင်ဗျား|ခင်ဗျ|ပါရှင့်|ပါရှင်|ရှင့်|ရှင်|ဗျ|နော်|ရှိမရှိ|ရနိုင်မလား|ရမလား|ရှိလား|ရှိလဲ|ရှိသလား|ရှိပါသလား|ရှိမလား|ရှိသေးလား|ရှိတယ်လား|မရှိဘူးလား|ရှိသလောက်|ပါသလား|လား)/gu, " ")
    .replace(/(?:ခင်ဗျား|ခင်ဗျ|ပါရှင့်|ပါရှင်|ရှင့်|ရှင်|ဗျ|နော်)/gu, " ")
    .replace(/(?:ရှာပေးပါ|ရှာပေး|ရှာပါ|ရှာချင်တယ်|ရှာချင်|ရှာပေးစေချင်|လိုချင်တယ်|လိုချင်|ပေးပါ|ပြပေးပါ|ပြပေး|ဖြေပေးပါ)/gu, " ")
    .replace(/(?:ဘယ်နှအုပ်|ဘယ်နှစ်အုပ်|ဘယ်လောက်|အရေအတွက်|ဘယ်စာအုပ်|ဘယ်ဟာ)/gu, " ")
    .replace(/(?:review|စာအုပ်အညွှန်း|သုံးသပ်ချက်|အညွှန်း)/giu, " ")
    .replace(/(?:အကြောင်းအရာ|အကြောင်းကို|အကြောင်းလေး|အကြောင်း)/gu, " ")
    .replace(/(?:ရဲ့|၏|ရေးတဲ့|ရေးသော|ရေးသည့်|သည်|ကော|ကို|အကြောင်း)/gu, " ")
    .replace(/[၊။!?၊,:;()\[\]{}"'`]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!query || query.length < 2) return null;
  return { query, compact: normalize(query), requestedFormat: /(?:pdf|ပီဒီအက်ဖ်)/iu.test(original) ? "pdf" : "" };
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
function directMessageExtra(message) {
  const topicId = message?.direct_messages_topic_id ?? message?.direct_messages_topic?.topic_id ?? message?.message_thread_id;
  return message?.chat?.is_direct_messages && topicId != null ? { direct_messages_topic_id: topicId } : {};
}
function autoDeleteEnabled(env) {
  return env.AUTO_DELETE_ENABLED !== "false" && env.AUTO_DELETE_ENABLED !== "0";
}

function allowCatalogSearch(message) {
  const key = `${String(message?.chat?.id || "unknown")}:${String(message?.from?.id || "unknown")}`;
  const now = Date.now();
  const recent = (searchThrottle.get(key) || []).filter((timestamp) => now - timestamp < 10000);
  if (recent.length >= 4) {
    searchThrottle.set(key, recent);
    return false;
  }
  recent.push(now);
  searchThrottle.set(key, recent);
  if (searchThrottle.size > 2000) searchThrottle.delete(searchThrottle.keys().next().value);
  return true;
}

function morningGreetingEnabled(env) {
  return env.ENABLE_MORNING_GREETING !== "false" && env.ENABLE_MORNING_GREETING !== "0";
}

function memberGreetingEnabled(env) {
  return env.ENABLE_MEMBER_GREETING !== "false" && env.ENABLE_MEMBER_GREETING !== "0";
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
  if (!morningGreetingEnabled(env)) return;
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
    allowed_updates: ["message", "edited_message", "channel_post", "callback_query", "inline_query", "chat_member", "my_chat_member", "business_connection", "business_message", "edited_business_message", "deleted_business_messages"],
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

function secretaryEnabled(env) {
  return env.SECRETARY_MODE_ENABLED === "true";
}

function secretaryOwnerId(env) {
  return String(adminId(env) || "").trim();
}

async function saveBusinessConnection(env, connection) {
  if (!connection?.id) return;
  const rights = connection.rights || {};
  await env.DB.prepare(
    `INSERT INTO business_connections(connection_id,user_id,user_chat_id,can_reply,can_read_messages,is_enabled,updated_at)
     VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(connection_id) DO UPDATE SET
       user_id=excluded.user_id,user_chat_id=excluded.user_chat_id,
       can_reply=excluded.can_reply,can_read_messages=excluded.can_read_messages,
       is_enabled=excluded.is_enabled,updated_at=excluded.updated_at`
  ).bind(
    String(connection.id),
    Number(connection.user?.id || 0),
    Number(connection.user_chat_id || 0),
    rights.can_reply ? 1 : 0,
    rights.can_read_messages ? 1 : 0,
    connection.is_enabled === false ? 0 : 1,
    Math.floor(Date.now() / 1000),
  ).run();
}

async function secretaryDraft(env, message) {
  if (!secretaryEnabled(env) || !message?.business_connection_id || !message?.chat?.id || !message?.text) return;
  const ownerId = secretaryOwnerId(env);
  if (!ownerId) return;
  const connection = await env.DB.prepare(
    "SELECT can_reply,is_enabled FROM business_connections WHERE connection_id=?"
  ).bind(String(message.business_connection_id)).first();
  if (connection && (!Number(connection.is_enabled) || !Number(connection.can_reply))) return;
  if (!connection) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO business_connections(connection_id,user_id,user_chat_id,can_reply,can_read_messages,is_enabled,updated_at)
       VALUES(?,?,?,?,?,?,?)`
    ).bind(String(message.business_connection_id), 0, 0, 1, 1, 1, Math.floor(Date.now() / 1000)).run();
  }
  const endpoint = env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
  if (!env.AI_API_KEY) return sendMessage(env, ownerId, "Secretary Mode အတွက် AI API key မရှိသေးပါ။");
  const recent = await env.DB.prepare(
    "SELECT original_text,draft_text FROM secretary_drafts WHERE connection_id=? AND chat_id=? AND status IN ('approved','pending') ORDER BY created_at DESC LIMIT 6"
  ).bind(String(message.business_connection_id), Number(message.chat.id)).all();
  const context = (recent.results || []).reverse().map((row) => `Customer: ${row.original_text}\nAssistant: ${row.draft_text}`).join("\n\n");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let draft;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env.AI_API_KEY}` },
      body: JSON.stringify({
        model: env.AI_MODEL || "gemini-3.8-flash",
        temperature: 0.35,
        max_tokens: 500,
        messages: [
          { role: "system", content: "You are a careful Burmese-speaking secretary. Draft a concise, polite reply to the customer. Do not claim to be the account owner. Do not invent prices, promises, availability, or personal facts. If the message needs the owner's decision, say that the owner will follow up. Return only the reply text, without headings or quotation marks." },
          { role: "user", content: `${context ? `Recent conversation:\n${context}\n\n` : ""}Customer message:\n${String(message.text).slice(0, 4000)}` },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Secretary AI HTTP ${response.status}`);
    const payload = await response.json();
    draft = String(payload?.choices?.[0]?.message?.content || "").trim().slice(0, 3500);
    if (!draft) throw new Error("empty secretary draft");
  } catch (error) {
    console.error("Secretary draft failed", error?.message || "unknown error");
    return sendMessage(env, ownerId, "Secretary Mode က AI draft မရေးနိုင်သေးပါ။ ခဏကြာပြီး ပြန်စမ်းပါ။");
  } finally {
    clearTimeout(timeout);
  }
  const token = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO secretary_drafts(token,connection_id,owner_id,chat_id,source_message_id,original_text,draft_text,status,created_at,expires_at)
     VALUES(?,?,?,?,?,?,?,?,?,?)`
  ).bind(token, String(message.business_connection_id), Number(ownerId), Number(message.chat.id), Number(message.message_id), String(message.text).slice(0, 4000), draft, "pending", now, now + 86400).run();
  return sendMessage(env, ownerId,
    `<b>Secretary Mode — စာကြမ်းအသစ်</b>\n\n<b>Customer:</b> ${escapeHtml(message.text).slice(0, 3000)}\n\n<b>AI Draft:</b> ${escapeHtml(draft)}`,
    { reply_markup: { inline_keyboard: [[{ text: "✅ Send to customer", callback_data: `secretary:approve:${token}` }, { text: "❌ Reject", callback_data: `secretary:reject:${token}` }]] } });
}

async function handleBusinessConnection(env, connection) {
  await saveBusinessConnection(env, connection);
  if (secretaryEnabled(env) && secretaryOwnerId(env) && connection?.is_enabled !== false) {
    await sendMessage(env, secretaryOwnerId(env), `✅ Secretary Mode connection ${escapeHtml(String(connection.id))} ကို မှတ်သားပြီးပါပြီ။`);
  }
}

async function sendBusinessMessage(env, message, text, extra = {}) {
  const { reply = true, ...telegramExtra } = extra;
  return telegram(env, "sendMessage", {
    chat_id: Number(message.chat.id),
    business_connection_id: String(message.business_connection_id),
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(reply && message.message_id ? { reply_parameters: { message_id: Number(message.message_id) } } : {}),
    ...telegramExtra,
  });
}

async function sendBusinessTyping(env, message) {
  try {
    await telegram(env, "sendChatAction", {
      chat_id: Number(message.chat.id),
      business_connection_id: String(message.business_connection_id),
      action: "typing",
    });
  } catch (error) {
    console.log("Business typing indicator skipped", error?.message || "unknown error");
  }
}

async function allowSecretaryReply(env, message) {
  const connectionId = String(message.business_connection_id || "");
  const chatId = Number(message.chat?.id || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!connectionId || !chatId) return false;
  const minimumInterval = Math.max(5, Number(env.SECRETARY_MIN_REPLY_INTERVAL_SECONDS || 12));
  const hourlyLimit = Math.max(1, Number(env.SECRETARY_MAX_REPLIES_PER_HOUR || 20));
  const row = await env.DB.prepare(
    "SELECT window_started_at,last_replied_at,reply_count FROM secretary_rate_limits WHERE connection_id=? AND chat_id=?"
  ).bind(connectionId, chatId).first();
  let windowStarted = Number(row?.window_started_at || now);
  let count = Number(row?.reply_count || 0);
  if (now - windowStarted >= 3600) {
    windowStarted = now;
    count = 0;
  }
  if (row && now - Number(row.last_replied_at || 0) < minimumInterval) return false;
  if (count >= hourlyLimit) return false;
  await env.DB.prepare(
    `INSERT INTO secretary_rate_limits(connection_id,chat_id,window_started_at,last_replied_at,reply_count)
     VALUES(?,?,?,?,?)
     ON CONFLICT(connection_id,chat_id) DO UPDATE SET
       window_started_at=excluded.window_started_at,last_replied_at=excluded.last_replied_at,reply_count=excluded.reply_count`
  ).bind(connectionId, chatId, windowStarted, now, count + 1).run();
  return true;
}

async function findSecretaryFaq(env, text) {
  const normalizedText = normalize(text);
  if (!normalizedText) return null;
  const result = await env.DB.prepare("SELECT trigger,answer FROM secretary_faq ORDER BY LENGTH(trigger) DESC LIMIT 200").all();
  const match = (result.results || []).find((row) => normalizedText.includes(normalize(row.trigger)));
  return match?.answer ? String(match.answer) : null;
}

const SECRETARY_FALLBACKS = {
  greeting: [
    "မင်္ဂလာပါရှင်။ စာပို့လာတာကို လက်ခံရရှိပါတယ်နော်။ ဘာကူညီပေးရမလဲရှင်။",
    "မင်္ဂလာပါရှင်။ အဆင်ပြေပါသလား။ မေးချင်တာလေး ပြောပေးပါနော်။",
    "ဟယ်လိုရှင်။ စာပို့ထားတာတွေ့ပါတယ်။ လိုအပ်တာကို ပြောလို့ရပါတယ်နော်။",
  ],
  thanks: [
    "ရပါတယ်ရှင်။ လိုအပ်တာရှိရင် အချိန်မရွေး ပြောလို့ရပါတယ်နော်။",
    "ကျေးဇူးတင်စရာမလိုပါဘူးရှင်။ ကူညီပေးရတာ ဝမ်းသာပါတယ်နော်။",
  ],
  general: [
    "စာပို့လာတာ ကျေးဇူးပါရှင်။ အကြောင်းအရာလေးကို စစ်ပြီး ပြန်ဖြေပေးပါမယ်နော်။",
    "နားလည်ပါတယ်ရှင်။ ဒီကိစ္စကို သေချာစဉ်းစားပြီး ပြန်ပြောပေးပါမယ်နော်။",
    "မေးထားတာလေးကို လက်ခံထားပါတယ်ရှင်။ လိုအပ်တာရှိရင် ထပ်ပြောပေးပါနော်။",
    "ဟုတ်ကဲ့ရှင်။ အကြောင်းအရာလေးကို ကြည့်ပြီး အဆင်ပြေအောင် ကူညီပေးပါမယ်နော်။",
    "စာရောက်ပါတယ်ရှင်။ ခဏလေး စစ်ပေးပြီး ပြန်အကြောင်းကြားပါမယ်နော်။",
    "နားလည်ပါပြီရှင်။ ပိုတိကျအောင် အသေးစိတ်လေး ပြောပေးရင် ကူညီပေးရလွယ်ပါမယ်နော်။",
    "အခုချက်ချင်း မသေချာသေးလို့ မှားမပြောချင်ပါဘူးရှင်။ စစ်ဆေးပြီး ပြန်ဖြေပေးပါမယ်နော်။",
  ],
};
const secretaryFallbackState = new Map();
function secretaryFallback(message) {
  const text = String(message.text || "");
  const key = /မင်္ဂလာ|hello|ဟယ်လို|hi\b/iu.test(text) ? "greeting" : (/ကျေးဇူး|thanks|thank you/iu.test(text) ? "thanks" : "general");
  const pool = SECRETARY_FALLBACKS[key];
  const stateKey = `${message.business_connection_id}:${message.chat.id}:${key}`;
  const previous = secretaryFallbackState.get(stateKey);
  const candidates = pool.map((_, index) => index).filter((index) => index !== previous);
  const index = candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
  secretaryFallbackState.set(stateKey, index);
  if (secretaryFallbackState.size > 1000) secretaryFallbackState.delete(secretaryFallbackState.keys().next().value);
  return pool[index];
}

async function sendBusinessBookResults(env, message, query, rows) {
  const visible = rows.slice(0, 10);
  const lines = [`<b>📚 ${escapeHtml(query)}</b> နဲ့ ကိုက်ညီတဲ့ စာအုပ် ${rows.length} အုပ် တွေ့ပါတယ်ရှင်။`, "အောက်က ခလုတ်ကနေ တိုက်ရိုက်ဖွင့်ကြည့်နိုင်ပါတယ်။"];
  const buttons = [];
  visible.forEach((row, index) => {
    lines.push(`\n<b>${index + 1}. ${escapeHtml(row.title || "ခေါင်းစဉ်မရှိ")}</b>${row.author ? ` — ${escapeHtml(row.author)}` : ""}`);
    try {
      const url = new URL(String(row.link || ""));
      if (["http:", "https:"].includes(url.protocol)) buttons.push([{ text: `📖 ${`${index + 1}. ${row.title || "စာအုပ်"}`.slice(0, 58)}`, url: url.toString() }]);
    } catch {}
  });
  return sendBusinessMessage(env, message, lines.join("\n"), { reply_markup: { inline_keyboard: buttons } });
}

async function openAiSecretaryReply(env, text, catalogContext = "") {
  if (!env.OPENAI_API_KEY) return "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.35,
        max_tokens: 500,
        messages: [
          { role: "system", content: "You are a warm, concise Burmese-speaking secretary. Reply naturally and politely. Do not invent facts, prices, promises, or personal information. Return only the reply text." },
          { role: "user", content: `${catalogContext ? `Known book catalog:\n${catalogContext}\n\n` : ""}Customer message:\n${String(text).slice(0, 4000)}` },
        ],
      }),
    });
    if (!response.ok) return "";
    const payload = await response.json();
    return String(payload?.choices?.[0]?.message?.content || "").trim().slice(0, 3500);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function groqApiKeys(env) {
  const keys = [env.GROQ_API_KEY, ...Array.from({ length: 10 }, (_, index) => env[`GROQ_API_KEY_${index + 1}`])];
  if (env.GROQ_API_KEYS) {
    try {
      const parsed = JSON.parse(env.GROQ_API_KEYS);
      if (Array.isArray(parsed)) keys.push(...parsed);
    } catch {
      keys.push(...String(env.GROQ_API_KEYS).split(/[\n,]/u));
    }
  }
  return [...new Set(keys.map((key) => String(key || "").trim()).filter(Boolean))];
}
async function groqSecretaryReply(env, text, catalogContext = "") {
  const keys = groqApiKeys(env);
  if (!keys.length) return "";
  for (const key of keys) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: env.GROQ_MODEL || "qwen/qwen3.8-27b",
          temperature: 0.35,
          max_tokens: 500,
          messages: [
            { role: "system", content: "You are a warm, concise Burmese-speaking secretary. Reply naturally and politely. Do not invent facts, prices, promises, or personal information. Return only the reply text." },
            { role: "user", content: `${catalogContext ? `Known book catalog:\n${catalogContext}\n\n` : ""}Customer message:\n${String(text).slice(0, 4000)}` },
          ],
        }),
      });
      if (response.ok) {
        const payload = await response.json();
        const answer = String(payload?.choices?.[0]?.message?.content || "").trim().slice(0, 3500);
        if (answer) return answer;
      }
    } catch {
      // Try the next permitted key, then continue to the other providers.
    } finally {
      clearTimeout(timeout);
    }
  }
  return "";
}

async function probeAiProvider(endpoint, key, model) {
  if (!key) return "မထည့်ရသေးပါ";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0, max_tokens: 20, messages: [{ role: "user", content: "Reply with OK" }] }),
    });
    if (response.ok) return "OK";
    const payload = await response.json().catch(() => ({}));
    const detail = String(payload?.error?.message || payload?.error?.status || "HTTP error").replace(/\s+/gu, " ").slice(0, 120);
    return `${response.status}: ${detail}`;
  } catch (error) {
    return error?.name === "AbortError" ? "timeout" : `${error?.name || "error"}`;
  } finally {
    clearTimeout(timeout);
  }
}

async function secretaryAutoReply(env, message) {
  if (!secretaryEnabled(env) || !message?.business_connection_id || !message?.chat?.id || !message?.text) return;
  if (message.from?.is_bot) return;
  console.log("Secretary business message received", message.chat.id, String(message.text).slice(0, 120));
  const connection = await env.DB.prepare(
    "SELECT can_reply,is_enabled FROM business_connections WHERE connection_id=?"
  ).bind(String(message.business_connection_id)).first();
  if (connection && (!Number(connection.is_enabled) || !Number(connection.can_reply))) return;
  if (!(await allowSecretaryReply(env, message))) return;
  const text = String(message.text).trim();
  await sendBusinessTyping(env, message);
  const natural = extractNaturalSearchQuery(text);
  const slashQuery = text.replace(/^\/(?:search|find)(?:@\w+)?\s*/iu, "").trim();
  const query = String(natural?.query || (slashQuery !== text ? slashQuery : text)).trim();
  const rows = query.length >= 2 ? await searchBooks(env, query) : [];
  if (rows.length) return sendBusinessBookResults(env, message, query, rows);
  if (natural || slashQuery !== text) {
    return sendBusinessMessage(env, message, `${escapeHtml(query)} နဲ့ ကိုက်ညီတဲ့ စာအုပ်ကို catalog ထဲမှာ မတွေ့သေးပါဘူးရှင်။`);
  }
  const faqAnswer = await findSecretaryFaq(env, text);
  if (faqAnswer) return sendBusinessMessage(env, message, escapeHtml(faqAnswer));
  const endpoint = env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
  const catalogContext = rows.slice(0, 8).map((row) => `${row.title || ""} — ${row.author || ""} — ${row.link || ""}`).join("\n");
  const groqAnswer = await groqSecretaryReply(env, text, catalogContext);
  if (groqAnswer) return sendBusinessMessage(env, message, escapeHtml(groqAnswer));
  if (!env.AI_API_KEY) {
    const openAiAnswer = await openAiSecretaryReply(env, text, catalogContext);
    return sendBusinessMessage(env, message, openAiAnswer ? escapeHtml(openAiAnswer) : secretaryFallback(message));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env.AI_API_KEY}` },
      body: JSON.stringify({
        model: env.AI_MODEL || "gemini-3.8-flash",
        temperature: 0.35,
        max_tokens: 500,
        messages: [
          { role: "system", content: "You are a warm, concise Burmese-speaking secretary replying automatically on behalf of the account owner. Reply naturally to the customer's message. Do not claim to be the owner. Do not invent personal facts, prices, availability, or promises. If the customer asks about a book and the catalog context is present, use it accurately and include the provided link when useful. Return only the reply text." },
          { role: "user", content: `${catalogContext ? `Known book catalog:\n${catalogContext}\n\n` : ""}Customer message:\n${text.slice(0, 4000)}` },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Secretary AI HTTP ${response.status}`);
    const payload = await response.json();
    const answer = String(payload?.choices?.[0]?.message?.content || "").trim().slice(0, 3500);
    if (!answer) throw new Error("empty secretary auto reply");
    return sendBusinessMessage(env, message, escapeHtml(answer));
  } catch (error) {
    console.error("Secretary auto reply failed", error?.message || "unknown error");
    const openAiAnswer = await openAiSecretaryReply(env, text, catalogContext);
    if (openAiAnswer) return sendBusinessMessage(env, message, escapeHtml(openAiAnswer));
    return sendBusinessMessage(env, message, secretaryFallback(message));
  } finally {
    clearTimeout(timeout);
  }
}

async function handleSecretaryCallback(env, query, token, choice) {
  const ownerId = secretaryOwnerId(env);
  if (!ownerId || String(query.from?.id || "") !== ownerId) {
    return sendMessage(env, query.message.chat.id, "ဒီ approval button ကို ပိုင်ရှင်ပဲ အသုံးပြုနိုင်ပါတယ်။");
  }
  const draft = await env.DB.prepare(
    "SELECT token,connection_id,owner_id,chat_id,source_message_id,draft_text,status FROM secretary_drafts WHERE token=? AND expires_at>?"
  ).bind(token, Math.floor(Date.now() / 1000)).first();
  if (!draft || draft.status !== "pending") return editMessage(env, query.message.chat.id, query.message.message_id, "ဒီ Secretary draft သက်တမ်းကုန်သွားပါပြီ သို့မဟုတ် အသုံးပြုပြီးပါပြီ။");
  if (choice === "reject") {
    await env.DB.prepare("UPDATE secretary_drafts SET status='rejected' WHERE token=?").bind(token).run();
    return editMessage(env, query.message.chat.id, query.message.message_id, "❌ Secretary draft ကို မပို့တော့ပါ။");
  }
  try {
    await telegram(env, "sendMessage", {
      chat_id: Number(draft.chat_id),
      business_connection_id: String(draft.connection_id),
      text: escapeHtml(String(draft.draft_text || "")),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_parameters: { message_id: Number(draft.source_message_id) },
    });
    await env.DB.prepare("UPDATE secretary_drafts SET status='approved' WHERE token=?").bind(token).run();
    return editMessage(env, query.message.chat.id, query.message.message_id, "✅ Customer ဆီ reply ပို့ပြီးပါပြီ။");
  } catch (error) {
    console.error("Secretary send failed", error?.message || "unknown error");
    return editMessage(env, query.message.chat.id, query.message.message_id, "⚠️ Customer ဆီ reply မပို့နိုင်သေးပါ။ Draft ကို မပျက်သေးပါ။");
  }
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
  const statements = [];
  records.forEach((record, recordNo) => {
    const author = record.author || "";
    const title = record.title || "";
    const link = record.link || messageLink(chatId, messageId);
    const createdAt = new Date().toISOString();
    statements.push(env.DB.prepare(
      `INSERT INTO books(chat_id,message_id,record_no,author,title,link,raw_text,created_at)
       VALUES(?,?,?,?,?,?,?,?)
       ON CONFLICT(chat_id,message_id,record_no) DO UPDATE SET
         author=excluded.author,title=excluded.title,link=excluded.link,
         raw_text=excluded.raw_text,created_at=excluded.created_at`
    ).bind(chatId, messageId, recordNo, author, title, link, rawText || "", createdAt));
    statements.push(env.DB.prepare(
      `INSERT INTO github_sync_outbox(chat_id,message_id,record_no,author,title,link,created_at)
       VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(chat_id,message_id,record_no) DO UPDATE SET
         author=excluded.author,title=excluded.title,link=excluded.link,created_at=excluded.created_at,
         sync_state='pending',attempt_count=0,last_error='',synced_at=''`
    ).bind(chatId, messageId, recordNo, author, title, link, createdAt));
  });
  for (let index = 0; index < statements.length; index += 50) {
    await env.DB.batch(statements.slice(index, index + 50));
  }
  if (statements.length) await syncPendingGitHub(env);
}

const GITHUB_BOOKS_API = "https://api.github.com/repos/aungsoemoethailand-arch/gemini-telegram-bot/contents/data/telegram_books.csv";
const GITHUB_BOOKS_BRANCH = "main";

function publicBookMetadata(record) {
  const author = String(record.author || "").replace(/\s+/gu, " ").trim();
  const title = String(record.title || "").replace(/\s+/gu, " ").trim();
  const link = String(record.link || "").trim();
  if (!title || author.length > 100 || title.length > 160 || link.length > 2048) return null;
  if (link && !/^https?:\/\/\S+$/iu.test(link)) return null;
  return { author, title, link };
}

function csvField(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function csvRow(values) {
  return values.map(csvField).join(",");
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("invalid_csv_quotes");
  if (field.length || row.length) {
    row.push(field.replace(/\r$/u, ""));
    rows.push(row);
  }
  return rows;
}

function decodeBase64Utf8(encoded) {
  const binary = atob(String(encoded || "").replace(/\s/gu, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function markGitHubOutbox(env, records, state, error = "") {
  const syncedAt = state === "synced" ? new Date().toISOString() : "";
  const increment = state === "pending" ? 1 : 0;
  const statements = records.map((record) => env.DB.prepare(
    `UPDATE github_sync_outbox
     SET sync_state=?,attempt_count=attempt_count+?,last_error=?,synced_at=?
     WHERE chat_id=? AND message_id=? AND record_no=?`
  ).bind(state, increment, error.slice(0, 120), syncedAt, record.chat_id, record.message_id, record.record_no));
  for (let index = 0; index < statements.length; index += 50) {
    await env.DB.batch(statements.slice(index, index + 50));
  }
}

async function syncPendingGitHub(env) {
  const token = String(env.GITHUB_SYNC_TOKEN || "").trim();
  if (!token) return;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "gemini-telegram-webhook",
  };

  for (let batchNumber = 0; batchNumber < 10; batchNumber += 1) {
    let pending = [];
    try {
      const result = await env.DB.prepare(
        `SELECT chat_id,message_id,record_no,author,title,link
         FROM github_sync_outbox WHERE sync_state='pending' ORDER BY created_at LIMIT 50`
      ).all();
      pending = result.results || [];
      if (!pending.length) return;

      const valid = [];
      const blocked = [];
      for (const record of pending) {
        const book = publicBookMetadata(record);
        if (book) valid.push({ record, book });
        else blocked.push(record);
      }
      if (blocked.length) await markGitHubOutbox(env, blocked, "blocked", "unsafe_public_metadata");
      if (!valid.length) continue;

      let content = "author,title,link\n";
      let sha = "";
      const getResponse = await fetch(`${GITHUB_BOOKS_API}?ref=${GITHUB_BOOKS_BRANCH}`, { headers });
      if (getResponse.status === 404) {
        // The file is created on the first successful sync if the backfill has not been pushed yet.
      } else if (!getResponse.ok) {
        await markGitHubOutbox(env, valid.map(({ record }) => record), "pending", `github_get_${getResponse.status}`);
        console.warn("GitHub book metadata read failed", getResponse.status);
        return;
      } else {
        const file = await getResponse.json();
        if (!file.content || file.encoding !== "base64" || Number(file.size || 0) > 900000) {
          await markGitHubOutbox(env, valid.map(({ record }) => record), "pending", "github_file_unavailable_or_too_large");
          console.warn("GitHub book metadata file cannot be read safely");
          return;
        }
        content = decodeBase64Utf8(file.content);
        sha = file.sha;
      }

      const parsed = parseCsvRows(content.replace(/^\uFEFF/u, ""));
      const header = parsed.shift() || [];
      if (header.length < 3 || header[0] !== "author" || header[1] !== "title" || header[2] !== "link") {
        await markGitHubOutbox(env, valid.map(({ record }) => record), "pending", "github_csv_header_mismatch");
        console.warn("GitHub book metadata header does not match expected format");
        return;
      }
      const makeKey = (book) => JSON.stringify([book.author, book.title, book.link]);
      const existing = new Set(parsed.filter((row) => row.length >= 3).map((row) => makeKey({ author: row[0], title: row[1], link: row[2] })));
      const additions = [];
      for (const entry of valid) {
        const key = makeKey(entry.book);
        if (!existing.has(key)) {
          additions.push(entry.book);
          existing.add(key);
        }
      }

      if (additions.length) {
        const updatedContent = `${content}${content.endsWith("\n") ? "" : "\n"}${additions.map((book) => csvRow([book.author, book.title, book.link])).join("\n")}\n`;
        const body = { message: `Sync ${additions.length} Telegram book metadata record(s) [skip ci]`, content: encodeBase64Utf8(updatedContent), branch: GITHUB_BOOKS_BRANCH };
        if (sha) body.sha = sha;
        const putResponse = await fetch(GITHUB_BOOKS_API, { method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if ((putResponse.status === 409 || putResponse.status === 422) && batchNumber < 9) continue;
        if (!putResponse.ok) {
          await markGitHubOutbox(env, valid.map(({ record }) => record), "pending", `github_put_${putResponse.status}`);
          console.warn("GitHub book metadata write failed", putResponse.status);
          return;
        }
      }

      await markGitHubOutbox(env, valid.map(({ record }) => record), "synced");
    } catch (error) {
      if (pending.length) {
        try {
          const retryable = pending.filter((record) => record.title && String(record.title).length <= 160 && String(record.author || "").length <= 100);
          if (retryable.length) await markGitHubOutbox(env, retryable, "pending", "github_sync_error");
        } catch {
          // Keep the original failure out of user-facing responses and retry on the next cron.
        }
      }
      console.warn("GitHub book metadata sync failed", error?.message || "unknown error");
      return;
    }
  }
}

async function importNewCatalogRecords(env, post, records, rawText) {
  await saveRecords(env, post.chat.id, post.message_id, records, rawText);
}

async function importChannelPost(env, post) {
  const text = post.text || post.caption || "";
  if (post.document?.file_name?.toLowerCase().endsWith(".csv")) {
    const file = await telegram(env, "getFile", { file_id: post.document.file_id });
    const response = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.result.file_path}`);
    const csv = await response.text();
    await importNewCatalogRecords(env, post, extractRecords(csv, messageLink(post.chat.id, post.message_id)), csv);
    return;
  }
  if (text) {
    const review = extractHashtagReview(text, messageLink(post.chat.id, post.message_id));
    if (review) await saveRecords(env, post.chat.id, post.message_id, [review], text);
    else await importNewCatalogRecords(env, post, extractRecords(text, messageLink(post.chat.id, post.message_id)), text);
  }
}

let authorAliasCache = null;

async function loadAuthorAliasData(env, refresh = false) {
  if (!refresh && authorAliasCache && authorAliasCache.expiresAt > Date.now()) return authorAliasCache.data;
  const result = await env.DB.prepare("SELECT alias_key,alias_name,group_id,position FROM author_aliases ORDER BY group_id,position").all();
  const rows = result.results || [];
  const byKey = new Map();
  const membersByGroup = new Map();
  for (const row of rows) {
    const groupId = String(row.group_id || "");
    const aliasKey = String(row.alias_key || normalize(row.alias_name));
    if (!groupId || !aliasKey) continue;
    byKey.set(aliasKey, row);
    if (!membersByGroup.has(groupId)) membersByGroup.set(groupId, []);
    membersByGroup.get(groupId).push(row);
  }
  const displayByGroup = new Map();
  for (const [groupId, members] of membersByGroup) {
    members.sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
    displayByGroup.set(groupId, members.map((row) => row.alias_name).join("/"));
  }
  const data = { rows, byKey, membersByGroup, displayByGroup };
  authorAliasCache = { expiresAt: Date.now() + 60_000, data };
  return data;
}

function authorIdentity(author, aliases) {
  const raw = String(author || "").trim();
  const linked = aliases.byKey.get(normalize(raw));
  if (!linked) return { key: `raw:${raw}`, display: raw };
  const groupId = String(linked.group_id);
  return { key: `group:${groupId}`, display: aliases.displayByGroup.get(groupId) || linked.alias_name || raw };
}

async function mergeAuthorAliases(env, inputNames) {
  const aliases = await loadAuthorAliasData(env, true);
  const merged = [];
  const seen = new Set();
  let groupId = "";
  const add = (name) => {
    const clean = String(name || "").trim().replace(/\s+/gu, " ");
    const key = normalize(clean);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push({ aliasKey: key, aliasName: clean });
  };
  for (const name of inputNames) {
    const key = normalize(name);
    const existing = aliases.byKey.get(key);
    if (!existing) {
      add(name);
      continue;
    }
    if (!groupId) groupId = String(existing.group_id);
    const members = aliases.membersByGroup.get(String(existing.group_id)) || [existing];
    for (const member of members) add(member.alias_name);
  }
  if (merged.length < 2) throw new Error("At least two distinct names are required");
  if (merged.length > 100) throw new Error("Alias group is too large");
  if (!groupId) groupId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.batch(merged.map((item, position) => env.DB.prepare(
    "INSERT INTO author_aliases(alias_key,alias_name,group_id,position,created_at) VALUES(?,?,?,?,?) ON CONFLICT(alias_key) DO UPDATE SET alias_name=excluded.alias_name,group_id=excluded.group_id,position=excluded.position"
  ).bind(item.aliasKey, item.aliasName, groupId, position, createdAt)));
  authorAliasCache = null;
  return merged.map((item) => item.aliasName);
}

async function searchBooks(env, query) {
  const now = Date.now();
  if (!bookRowsCache || now - bookRowsCacheAt > 30000) {
    const rows = await env.DB.prepare("SELECT chat_id,author,title,link,raw_text FROM books ORDER BY id DESC LIMIT 2000").all();
    bookRowsCache = rows.results || [];
    bookSearchEntriesCache = bookRowsCache.map((row) => ({ row, author: normalize(row.author), title: normalize(row.title), isReview: isReviewRecord(row) }));
    bookRowsCacheAt = now;
  }
  const needle = normalize(query);
  const parts = String(query || "").split(/\s+/).map(normalize).filter(Boolean);
  const aliases = await loadAuthorAliasData(env);
  const queryGroup = aliases.byKey.get(needle)?.group_id || "";
  return bookSearchEntriesCache.filter((entry) => {
    if (entry.isReview) return false;
    const combined = `${entry.author}${entry.title}`;
    const authorGroup = aliases.byKey.get(entry.author)?.group_id || "";
    return entry.author.includes(needle) || entry.title.includes(needle) || (queryGroup && authorGroup === queryGroup) || (parts.length > 1 && parts.every((part) => combined.includes(part)));
  }).map((entry) => entry.row).slice(0, MAX_BOOK_RESULTS);
}

async function handleInlineQuery(env, inlineQuery) {
  const inlineQueryId = String(inlineQuery?.id || "");
  if (!inlineQueryId) return;
  const query = String(inlineQuery.query || "").trim();
  if (normalize(query).length < 2) {
    return telegram(env, "answerInlineQuery", {
      inline_query_id: inlineQueryId,
      results: [],
      cache_time: 0,
      is_personal: true,
    });
  }

  try {
    const books = await searchBooks(env, query);
    const results = books.slice(0, 20).map((book, index) => {
      const title = String(book.title || "စာအုပ်").trim();
      const author = String(book.author || "").trim();
      const result = {
        type: "article",
        id: String(index + 1),
        title: title.slice(0, 128),
        description: author.slice(0, 128) || "စာရေးသူမသိ",
        input_message_content: {
          message_text: `📖 <b>${escapeHtml(title)}</b>\n✍️ ${escapeHtml(author || "စာရေးသူမသိ")}`,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        },
      };
      try {
        const url = new URL(String(book.link || ""));
        if (["http:", "https:"].includes(url.protocol)) {
          result.reply_markup = { inline_keyboard: [[{ text: "📥 စာအုပ်ဖွင့်ရန်", url: url.toString() }]] };
        }
      } catch {}
      return result;
    });
    return telegram(env, "answerInlineQuery", {
      inline_query_id: inlineQueryId,
      results,
      cache_time: results.length ? 30 : 0,
      is_personal: true,
    });
  } catch (error) {
    console.error("Inline search failed", error?.message || "unknown error");
    try {
      return await telegram(env, "answerInlineQuery", {
        inline_query_id: inlineQueryId,
        results: [],
        cache_time: 0,
        is_personal: true,
      });
    } catch (answerError) {
      console.error("Inline answer failed", answerError?.message || "unknown error");
    }
  }
}

async function searchExactBook(env, query) {
  const needle = normalize(query);
  const now = Date.now();
  if (!bookRowsCache || now - bookRowsCacheAt > 30000) {
    const rows = await env.DB.prepare("SELECT chat_id,author,title,link,raw_text FROM books ORDER BY id DESC LIMIT 2000").all();
    bookRowsCache = rows.results || [];
    bookSearchEntriesCache = bookRowsCache.map((row) => ({ row, author: normalize(row.author), title: normalize(row.title), isReview: isReviewRecord(row) }));
    bookRowsCacheAt = now;
  }
  const aliases = await loadAuthorAliasData(env);
  const queryGroup = aliases.byKey.get(needle)?.group_id || "";
  return bookSearchEntriesCache.filter((entry) => {
    if (entry.isReview) return false;
    const authorGroup = aliases.byKey.get(entry.author)?.group_id || "";
    return entry.author === needle || entry.title === needle || (queryGroup && authorGroup === queryGroup);
  }).map((entry) => entry.row).slice(0, MAX_BOOK_RESULTS);
}

function shouldUseSmartSearch(text, isGroup, botMentioned, replyTarget) {
  if (isGroup && !botMentioned && replyTarget?.from?.is_bot !== true) return false;
  return /စာအုပ်|စာရေးသူ|စာရေးတဲ့|review|အညွှန်း|epub|pdf|file|ဖိုင်|ရှိ|ရှာ|ဖတ်|ရေးတဲ့|ရေးသော|ဘယ်|လိုချင်|အကြောင်း|ပြောပြ|သမိုင်း|ဘဝ|about|who|what/iu.test(String(text || ""));
}

async function interpretCatalogQuery(env, text) {
  if (!env.AI_API_KEY) return null;
  const endpoint = env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
  const model = env.AI_MODEL || "gpt-4o-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const requestBody = {
      model,
      temperature: 0,
      max_tokens: 180,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a strict Telegram book assistant intent parser. Do not answer the user. Return JSON only with intent (books, reviews, info, none), query, author, title, confidence. Use books for availability/catalog/file searches, reviews for reviews or book recommendations already in the review source, info for questions asking to explain or tell about a book, author, or literature, and none for ordinary chat. Understand Burmese honorifics, polite endings, spacing, ebook/file wording, and phrases such as 'written by'. Remove words like book, ebook, file, review, please search, available, how many, tell me about. Never invent names." },
        { role: "user", content: String(text || "").slice(0, 500) },
      ],
    };
    let response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env.AI_API_KEY}` },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      delete requestBody.response_format;
      response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${env.AI_API_KEY}` },
        body: JSON.stringify(requestBody),
      });
    }
    if (!response.ok) return null;
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    if (!parsed || !["books", "reviews", "info", "none"].includes(parsed.intent)) return null;
    return {
      intent: parsed.intent,
      query: String(parsed.query || "").trim().slice(0, 300),
      author: String(parsed.author || "").trim().slice(0, 150),
      title: String(parsed.title || "").trim().slice(0, 200),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    };
  } catch (error) {
    console.log("Smart search parser skipped", error?.name === "AbortError" ? "timeout" : (error?.message || "unknown error"));
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function trimSourceText(text, limit = 5000) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

async function fetchSourceText(url, limit = 5000) {
  try {
    const response = await fetch(url, { headers: { accept: "text/html,application/json" } });
    if (!response.ok) return "";
    return trimSourceText(await response.text(), limit);
  } catch (error) {
    console.log("Source fetch skipped", error?.message || "unknown error");
    return "";
  }
}

async function gatherBookInfoSources(env, query) {
  const encoded = encodeURIComponent(query);
  const wikiMyUrl = `https://my.wikipedia.org/w/rest.php/v1/search/page?q=${encoded}&limit=3`;
  const wikiEnUrl = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encoded}&limit=3`;
  const reviewPromise = localReviewMatches(env, query);
  const [wikiMy, wikiEn, goodreads, saveLibrary, reviews] = await Promise.all([
    fetchSourceText(wikiMyUrl, 4500),
    fetchSourceText(wikiEnUrl, 4500),
    fetchSourceText(`https://www.goodreads.com/search?q=${encoded}`, 5000),
    fetchSourceText("https://savethelibrarymyanmar.org/", 3500),
    reviewPromise,
  ]);
  const sources = [];
  if (wikiMy) sources.push({ name: "မြန်မာ Wikipedia", url: wikiMyUrl, text: wikiMy });
  if (wikiEn) sources.push({ name: "English Wikipedia", url: wikiEnUrl, text: wikiEn });
  if (goodreads) sources.push({ name: "Goodreads", url: `https://www.goodreads.com/search?q=${encoded}`, text: goodreads });
  if (saveLibrary) sources.push({ name: "Save the Library Myanmar", url: "https://savethelibrarymyanmar.org/", text: saveLibrary });
  for (const review of (reviews || []).slice(0, 3)) {
    sources.push({ name: "Whisper Of Words Review", url: review.link || REVIEW_SITE_BASE, text: `${review.title || ""} ${review.author || ""} ${review.body || ""}` });
  }
  return sources;
}

async function answerBookInfo(env, chatId, query, cleanup = {}) {
  const sources = await gatherBookInfoSources(env, query);
  if (!sources.length) return sendMessage(env, chatId, `${escapeHtml(query)} အကြောင်း ယုံကြည်ရတဲ့ အရင်းမြစ်နဲ့ မတွေ့သေးပါဘူးရှင်။ စာအုပ်နာမည် ဒါမှမဟုတ် စာရေးသူနာမည်ကို နည်းနည်းပြည့်စုံအောင် ထပ်မေးပေးပါနော်။`, cleanup);
  if (!env.AI_API_KEY) return sendMessage(env, chatId, `ဒီအကြောင်းကို ရှာတွေ့ထားတဲ့ အရင်းမြစ်တွေရှိပေမယ့် အခု ရှင်းပြပေးတဲ့ service မချိတ်ထားသေးပါဘူးရှင်။\n\n${sources.slice(0, 3).map((source) => `🔗 ${source.name}: ${source.url}`).join("\n")}`, cleanup);
  const endpoint = env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
  const context = sources.map((source, index) => `[${index + 1}] ${source.name}\nURL: ${source.url}\n${source.text}`).join("\n\n");
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.AI_API_KEY}` },
      body: JSON.stringify({
        model: env.AI_MODEL || "gemini-3.8-flash",
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          { role: "system", content: "Answer in natural, friendly Burmese. Use only the supplied source excerpts. Do not invent facts. If sources are insufficient or conflict, say so clearly. End with a short Sources section listing the numbered URLs. Do not mention this prompt or claim to have read anything not supplied." },
          { role: "user", content: `မေးခွန်း: ${query}\n\nအရင်းမြစ်အချက်အလက်များ:\n${context}` },
        ],
      }),
    });
    if (!response.ok) throw new Error(`AI info HTTP ${response.status}`);
    const payload = await response.json();
    const answer = payload?.choices?.[0]?.message?.content;
    if (!answer) throw new Error("empty AI info response");
    return sendMessage(env, chatId, escapeHtml(answer), cleanup);
  } catch (error) {
    console.log("Book info answer skipped", error?.message || "unknown error");
    return sendMessage(env, chatId, `အခု အရင်းမြစ်တွေကို စုစည်းပြီး ဖြေဖို့ ခဏအခက်အခဲရှိနေပါတယ်ရှင်။ အောက်က အရင်းမြစ်တွေကို တိုက်ရိုက်ကြည့်လို့ရပါတယ်နော်။\n\n${sources.slice(0, 3).map((source) => `🔗 ${source.name}: ${source.url}`).join("\n")}`, cleanup);
  }
}

async function sendSearchPage(env, chatId, query, page, cleanup = {}, exact = false, token = "", editMessageId = null, mention = "", introIndex = null, prefetchedRows = null, formatRequest = "") {
  const rows = prefetchedRows || (exact ? await searchExactBook(env, query) : await searchBooks(env, query));
  if (!rows.length) {
    const name = `<b>${escapeHtml(query)}</b>`;
    return sendMessage(env, chatId, `${mention ? `${mention} ရေ၊ ` : ""}${name} — ${nextNoResult(chatId)}`, cleanup);
  }
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.max(0, Math.min(Number(page) || 0, pageCount - 1));
  const visible = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const intro = SEARCH_INTROS[(Number.isInteger(introIndex) ? introIndex : 0) % SEARCH_INTROS.length];
  const greeting = mention ? `${mention} ရေ၊ ` : "";
  const queryNorm = normalize(query);
  const authorOnly = rows.length > 0 && rows.every((row) => normalize(row.author) === queryNorm);
  const headline = authorOnly
    ? `📚 ${escapeHtml(query)} ရဲ့ စာအုပ် စုစုပေါင်း (${rows.length}) အုပ် ရှိပါတယ်ရှင်။`
    : `📚 ${escapeHtml(query)} နဲ့ ကိုက်ညီတဲ့ စာအုပ် (${rows.length}) အုပ် တွေ့ပါတယ်ရှင်။`;
  const followUp = authorOnly ? "ဘယ်စာအုပ်လေး လိုချင်လဲ ပြောပါနော်။ အောက်က စာရင်းထဲက ရွေးလို့ရပါတယ်ရှင်။" : intro;
  const lines = [`<b>${greeting}${headline}</b>`, followUp];
  if (formatRequest === "pdf") lines.push(`\n${nextPdfNote(chatId)}`);
  lines.push(`စာမျက်နှာ ${safePage + 1}/${pageCount}`);
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

async function sendSearch(env, chatId, query, cleanup = {}, exact = false, speaker = null, prefetchedRows = null, formatRequest = "") {
  const token = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const mention = speaker?.chatType && speaker.chatType !== "private" ? userMention(speaker.user) : "";
  const introIndex = nextSearchIntro(chatId);
  const rows = prefetchedRows || (exact ? await searchExactBook(env, query) : await searchBooks(env, query));
  const sessionRows = rows.slice(0, MAX_BOOK_RESULTS).map((row) => ({ chat_id: row.chat_id, author: row.author, title: row.title, link: row.link }));
  const storedQuery = JSON.stringify({ query, exact, mention, introIndex, formatRequest, rows: sessionRows });
  searchSessionCache.set(token, storedQuery);
  if (searchSessionCache.size > 500) searchSessionCache.delete(searchSessionCache.keys().next().value);
  env.DB.prepare("INSERT OR REPLACE INTO search_sessions(token,query,created_at) VALUES(?,?,?)")
    .bind(token, storedQuery, Math.floor(Date.now() / 1000)).run().catch((error) => console.log("Search session persistence skipped", error?.message || "unknown error"));
  return sendSearchPage(env, chatId, query, 0, cleanup, exact, token, null, mention, introIndex, rows, formatRequest);
}

async function catalogPage(env, chatId, kind, page, cleanup = {}, editMessageId = null) {
  const pageSize = 20;
  let items;
  if (kind === "authors") {
    const rows = await env.DB.prepare("SELECT chat_id,author,title,link,raw_text FROM books WHERE author<>'' ORDER BY author LIMIT 2000").all();
    const aliases = await loadAuthorAliasData(env);
    const counts = new Map();
    for (const row of rows.results || []) {
      if (isReviewRecord(row)) continue;
      const identity = authorIdentity(row.author, aliases);
      const item = counts.get(identity.key) || { author: identity.display, count: 0 };
      item.count += 1;
      counts.set(identity.key, item);
    }
    items = [...counts.values()];
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
      if (row.link) {
        try {
          const bookUrl = new URL(String(row.link).trim());
          if (bookUrl.protocol === "http:" || bookUrl.protocol === "https:") {
            lines.push(`<a href="${escapeHtml(bookUrl.href)}">🔗 ဖတ်ရန်</a>`);
          }
        } catch {
          // Skip malformed links from imported records.
        }
      }
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

async function catalogDeleteAllowed(env, message) {
  if (message.chat?.type === "private") return await isBotAdmin(env, message.from);
  if (isGroupMessage(message)) return await isAuthorizedGroupAdmin(env, message);
  return false;
}

async function findDeleteBooks(env, query = "") {
  const rows = await env.DB.prepare("SELECT id,author,title,link,raw_text FROM books ORDER BY id DESC LIMIT 2000").all();
  const needle = normalize(query);
  const terms = String(query || "").split(/\s+/).map(normalize).filter(Boolean);
  return (rows.results || []).filter((row) => {
    if (isReviewRecord(row)) return false;
    if (!needle) return true;
    const haystack = normalize(`${row.author} ${row.title}`);
    return haystack.includes(needle) || (terms.length > 1 && terms.every((term) => haystack.includes(term)));
  }).slice(0, 10);
}

async function createDeleteSession(env, requesterId, chatId, bookId) {
  const token = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  await env.DB.prepare("INSERT INTO delete_sessions(token,requester_id,chat_id,book_id,created_at) VALUES(?,?,?,?,?)")
    .bind(token, requesterId, chatId, bookId, Math.floor(Date.now() / 1000)).run();
  return token;
}

async function sendDeleteConfirmation(env, message, book, cleanup = {}) {
  const token = await createDeleteSession(env, message.from.id, message.chat.id, book.id);
  return sendMessage(env, message.chat.id,
    `<b>🗑 စာအုပ်ဖျက်ရန် အတည်ပြုပါ</b>\n\n✍️ စာရေးသူ: <b>${escapeHtml(book.author || "မသိရသေးပါ")}</b>\n📖 စာအုပ်: <b>${escapeHtml(book.title || "ခေါင်းစဉ်မရှိ")}</b>\n\nဒီစာအုပ်ကို catalog ထဲက ဖျက်မှာ သေချာပါသလားရှင်? Channel မူရင်း post ကတော့ မပျက်ပါဘူး။`, {
      ...cleanup,
      reply_markup: { inline_keyboard: [[
        { text: "✅ ဖျက်မည်", callback_data: `delete:yes:${token}` },
        { text: "❌ မဖျက်တော့ပါ", callback_data: `delete:no:${token}` },
      ]] },
    });
}

async function sendDeleteCandidates(env, message, books, cleanup = {}) {
  if (!books.length) return sendMessage(env, message.chat.id, "ဒီနာမည်နဲ့ ဖျက်လို့ရမယ့် catalog စာအုပ် မတွေ့ပါဘူးရှင်။ စာရေးသူနဲ့ စာအုပ်နာမည်ကို ပြန်စစ်ပေးပါနော်။", cleanup);
  const buttons = [];
  for (const book of books) {
    const token = await createDeleteSession(env, message.from.id, message.chat.id, book.id);
    buttons.push([{ text: `🗑 ${String(book.title || "စာအုပ်").slice(0, 48)} — ${String(book.author || "").slice(0, 20)}`, callback_data: `delete:pick:${token}` }]);
  }
  return sendMessage(env, message.chat.id, `<b>ဖျက်ချင်တဲ့ စာအုပ်ကို ရွေးပေးပါရှင်။</b>\n\nတွေ့ထားတဲ့ catalog စာအုပ် ${books.length} အုပ်ထဲက ရွေးနိုင်ပါတယ်။ ရွေးပြီးရင်လည်း အတည်ပြုချက် ထပ်တောင်းပါမယ်။`, { ...cleanup, reply_markup: { inline_keyboard: buttons } });
}

function deleteQueryFromReply(message) {
  const text = String(message.reply_to_message?.text || message.reply_to_message?.caption || "");
  const titleLine = text.match(/(?:စာအုပ်နာမည်|စာအုပ်အမည်|title)\s*[:：-]\s*(.+)/i);
  const authorLine = text.match(/(?:စာရေးသူ|author)\s*[:：-]\s*(.+)/i);
  if (titleLine || authorLine) return [authorLine?.[1] || "", titleLine?.[1] || ""].filter(Boolean).join(" ");
  const numbered = text.match(/^\s*1\.\s*(.+?)\s+—\s+(.+?)\s*$/m);
  return numbered ? `${numbered[2]} ${numbered[1]}` : "";
}

async function handleDeleteCommand(env, message, query, reply) {
  if (!(await catalogDeleteAllowed(env, message))) return reply("စာအုပ်ဖျက်တာကို owner၊ bot admin ဒါမှမဟုတ် group admin ကပဲ သုံးနိုင်ပါတယ်ရှင်။");
  const targetQuery = query || deleteQueryFromReply(message);
  const books = await findDeleteBooks(env, targetQuery);
  if (!targetQuery) return sendDeleteCandidates(env, message, books);
  if (books.length === 1) return sendDeleteConfirmation(env, message, books[0]);
  return sendDeleteCandidates(env, message, books);
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
  // Audit logging and log-channel delivery are intentionally disabled to minimize free-tier usage.
  return null;
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
  if (!memberGreetingEnabled(env)) return;
  const members = kind === "welcome" ? message.new_chat_members || [] : [message.left_chat_member];
  for (const member of members) {
    if (!member?.id) continue;
    const label = `<a href="tg://user?id=${member.id}">${escapeHtml([member.first_name, member.last_name].filter(Boolean).join(" ") || member.username || "မိတ်ဆွေ")}</a>`;
    const text = await nextGreeting(env, message.chat.id, kind, kind === "welcome" ? WELCOME_TEXTS : GOODBYE_TEXTS);
    await sendTemporaryMembershipMessage(env, message.chat.id, `${label}\n${text}`);
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
  const cleanup = { ...(isGroupMessage(message) ? { __deleteAfterSeconds: resultDeleteSeconds(env) } : {}), ...directMessageExtra(message) };
  const reply = (text, extra = {}) => sendMessage(env, chatId, text, { ...cleanup, ...extra });
  if (await handleGuardianCommand(env, message, command, args, reply)) return null;
  if (command === "/refreshwebhook") {
    if (message.chat.type !== "private" || !(await isAdmin(env, message.from))) return reply("ဒီ command ကို ပိုင်ရှင်က သီးသန့်စကားဝိုင်းကနေသာ အသုံးပြုနိုင်ပါတယ်။");
    try {
      await ensureWebhook(env);
      return reply("✅ Webhook ကို အသစ်ပြင်ဆင်ပြီးပါပြီ။ အခု inline ရှာဖွေမှုကို သုံးနိုင်ပါပြီ။");
    } catch (error) {
      console.error("Webhook refresh failed", error?.message || "unknown error");
      return reply("Webhook ကို အသစ်ပြင်ဆင်လို့ မရသေးပါ။ ခဏစောင့်ပြီး ပြန်စမ်းပါ။");
    }
  }
  if (command === "/aicheck") {
    if (message.chat.type !== "private" || !(await isAdmin(env, message.from))) return reply("ဒီ command ကို owner admin က private DM မှာပဲ သုံးနိုင်ပါတယ်။");
    const gemini = await probeAiProvider(env.AI_API_URL || "https://api.openai.com/v1/chat/completions", env.AI_API_KEY, env.AI_MODEL || "gemini-3.8-flash");
    const openai = await probeAiProvider("https://api.openai.com/v1/chat/completions", env.OPENAI_API_KEY, env.OPENAI_MODEL || "gpt-4o-mini");
    const groq = await probeAiProvider("https://api.groq.com/openai/v1/chat/completions", env.GROQ_API_KEY, env.GROQ_MODEL || "qwen/qwen3.8-27b");
    return reply(`<b>AI provider test</b>\nGemini: <code>${escapeHtml(gemini)}</code>\nGroq/Qwen: <code>${escapeHtml(groq)}</code>\nChatGPT: <code>${escapeHtml(openai)}</code>`);
  }
  if (command === "/start" || command === "/help") {
    return reply("<b>📚 စာအုပ်ရှာဖွေရေး Bot</b>\n\nအောက်က menu ကနေ ရွေးနိုင်ပါတယ်ရှင်။", { reply_markup: { inline_keyboard: [
      [{ text: "🔎 စာအုပ်ရှာမယ်", callback_data: "help_search" }, { text: "✍️ စာရေးသူများ", callback_data: "help_authors" }],
      [{ text: "📚 စာအုပ်များ", callback_data: "help_books" }, { text: "📊 အခြေအနေ", callback_data: "help_stats" }],
    ] } });
  }
  if (["/faqadd", "/faq", "/faqdel", "/faqlist"].includes(command)) {
    if (message.chat.type !== "private" || !(await isAdmin(env, message.from))) return reply("ဒီ command ကို owner admin က private DM မှာပဲ သုံးနိုင်ပါတယ်။");
    if (command === "/faqlist") {
      const rows = await env.DB.prepare("SELECT id,trigger,answer FROM secretary_faq ORDER BY id DESC LIMIT 50").all();
      if (!(rows.results || []).length) return reply("FAQ မထည့်ရသေးပါ။");
      return reply(`<b>Secretary FAQ (${rows.results.length})</b>\n\n${rows.results.map((row) => `<code>${row.id}</code>. <b>${escapeHtml(row.trigger)}</b>\n${escapeHtml(row.answer)}`).join("\n\n")}`);
    }
    if (command === "/faqdel") {
      const id = Number(args[0]);
      if (!Number.isInteger(id)) return reply("သုံးပုံ: <code>/faqdel 1</code>");
      await env.DB.prepare("DELETE FROM secretary_faq WHERE id=?").bind(id).run();
      return reply(`✅ FAQ #${id} ကို ဖျက်ပြီးပါပြီ။`);
    }
    const separator = text.indexOf("|");
    if (separator < 0) return reply("သုံးပုံ: <code>/faqadd မေးခွန်းအပိုင်း | ပြန်ဖြေစေချင်တဲ့စာ</code>\nဥပမာ: <code>/faqadd စာအုပ်ဖိုင်ရလား | ရပါတယ်ရှင်။ စာအုပ်နာမည်လေး ပြောပေးပါနော်။</code>");
    const trigger = text.slice(rawCommand.length, separator).trim().replace(/\s+/gu, " ");
    const answer = text.slice(separator + 1).trim();
    if (trigger.length < 2 || answer.length < 2 || trigger.length > 200 || answer.length > 3500) return reply("မေးခွန်းအပိုင်း ၂–၂၀၀ လုံး၊ အဖြေ ၂–၃၅၀၀ လုံးအတွင်း ထည့်ပေးပါ။");
    await env.DB.prepare("INSERT INTO secretary_faq(trigger,answer,created_at) VALUES(?,?,?) ON CONFLICT(trigger) DO UPDATE SET answer=excluded.answer,created_at=excluded.created_at").bind(trigger, answer, Math.floor(Date.now() / 1000)).run();
    return reply(`✅ FAQ သိမ်းပြီးပါပြီ။\nမေးခွန်း: <b>${escapeHtml(trigger)}</b>\nအဖြေ: ${escapeHtml(answer)}`);
  }
  if (command === "/add") {
    if (message.chat.type !== "private" || !(await isAdmin(env, message.from))) return reply("ဒီ command ကို owner admin က private DM မှာပဲ သုံးနိုင်ပါတယ်။");
    const target = await resolveUserId(env, args[0]);
    if (!target) return reply("သုံးပုံ: /add <Telegram ID သို့မဟုတ် @username>\nUsername ကိုရှာရန် အဲဒီ user က bot ကို အရင် message ပို့ထားရပါမယ်။");
    await env.DB.prepare("INSERT OR REPLACE INTO bot_admins(user_id,username,added_by,created_at) VALUES(?,?,?,?)").bind(target, String(args[0] || "").replace(/^@/, ""), message.from.id, Math.floor(Date.now() / 1000)).run();
    return reply(`✅ Bot admin ထည့်ပြီးပါပြီ။\nUser: <code>${escapeHtml(target)}</code>`);
  }
  if (command === "/merge") {
    if (message.chat.type !== "private" || !(await isAdmin(env, message.from))) return reply("ဒီ command ကို owner admin က private DM မှာပဲ သုံးနိုင်ပါတယ်။");
    const names = [...new Map(query.split("+").map((name) => name.trim().replace(/\s+/gu, " ")).filter(Boolean).map((name) => [normalize(name), name])).values()];
    if (names.length < 2 || names.length > 10 || names.some((name) => name.length > 100)) {
      return reply("သုံးပုံ: <code>/merge မင်းကျော်+ကျော်လှိုင်ဦး</code>\nနာမည်အသစ် ထပ်ထည့်ရန်: <code>/merge မင်းကျော်+ကျော်လှိုင်ဦး+ကိုကျော်</code>");
    }
    try {
      const mergedNames = await mergeAuthorAliases(env, names);
      return reply(`✅ <b>ကလောင်အမည်များကို ချိတ်ဆက်ပြီးပါပြီ</b>\nအုပ်စု: <b>${escapeHtml(mergedNames.join("/"))}</b>\nယခု အုပ်စုထဲရှိ မည်သည့်အမည်ဖြင့်မဆို ရှာလျှင် ဆက်စပ်စာအုပ်များကို ပြပေးပါမည်။`);
    } catch (error) {
      console.log("Author alias merge failed", error?.message || "unknown error");
      return reply("ကလောင်အမည်များကို ချိတ်ဆက်ရာတွင် အမှားဖြစ်သွားပါတယ်။ ခဏကြာပြီး ပြန်စမ်းပါ၊ သို့မဟုတ် ပိုင်ရှင်အကောင့်မှ သုံးနေကြောင်း စစ်ဆေးပါ။");
    }
  }
  if (command === "/del" || command === "/delete") return handleDeleteCommand(env, message, query, reply);
  if (command === "/admins") {
    if (message.chat.type !== "private" || !(await isAdmin(env, message.from))) return reply("ဒီ command ကို owner admin က private DM မှာပဲ သုံးနိုင်ပါတယ်။");
    const rows = await env.DB.prepare("SELECT user_id,username FROM bot_admins ORDER BY created_at").all();
    const list = (rows.results || []).map((row, index) => `${index + 1}. <code>${row.user_id}</code>${row.username ? ` @${escapeHtml(row.username)}` : ""}`).join("\n");
    return reply(`<b>Bot Admin များ</b>\nOwner: <code>${escapeHtml(adminId(env))}</code>${list ? `\n${list}` : "\nထပ်ထည့်ထားတဲ့ admin မရှိသေးပါ။"}`);
  }
  if (["/usercount", "/users"].includes(command)) {
    if (message.chat.type !== "private" || !(await isAdmin(env, message.from))) return reply("ဒီ command ကို owner admin က private DM မှာပဲ သုံးနိုင်ပါတယ်။");
    const row = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN username <> '' THEN 1 ELSE 0 END) AS with_username, MAX(updated_at) AS last_active FROM known_users").first();
    return reply(`<b>👥 Bot အသုံးပြုသူစာရင်း</b>\n\nစုစုပေါင်း message ပို့ဖူးသူ: <b>${Number(row?.total || 0)}</b> ယောက်\nUsername ရှိသူ: <b>${Number(row?.with_username || 0)}</b> ယောက်\nနောက်ဆုံး activity: <code>${escapeHtml(row?.last_active || "မရှိသေးပါ")}</code>\n\n<i>ဒီအရေအတွက်က bot ကို message ပို့ဖူးသူတွေကိုပဲ တွက်ထားတာပါ။ Group member အားလုံးကို မတွက်ထားပါ။</i>`);
  }
  if (["ban", "unban", "kick", "remove", "mute", "unmute"].includes(command)) {
    if (await moderateMember(env, message, command.slice(1), args)) return null;
  }
  if (command === "/search" || command === "/find") {
    if (!allowCatalogSearch(message)) return null;
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
    const rows = await env.DB.prepare("SELECT chat_id,author,title,link,raw_text FROM books").all();
    const catalogRows = (rows.results || []).filter((row) => !isReviewRecord(row));
    const aliases = await loadAuthorAliasData(env);
    const authors = new Set(catalogRows.map((row) => authorIdentity(row.author, aliases).key).filter((key) => key !== "raw:"));
    return reply(`<b>📊 Catalog စာရင်းအခြေအနေ</b>\n\n📚 စာအုပ်စုစုပေါင်း: <b>${catalogRows.length}</b> အုပ်\n✍️ စာရေးသူစုစုပေါင်း: <b>${authors.size}</b> ဦး`);
  }
  return null;
}

async function handleMessage(env, message) {
  const text = String(message.text || "").trim();
  if (!text) return;
  if (message?.chat?.is_direct_messages) {
    console.log("Channel direct message received", JSON.stringify({ chatId: message.chat.id, topicId: message.direct_messages_topic_id ?? message.direct_messages_topic?.topic_id ?? message.message_thread_id, text: text.slice(0, 120) }));
    telegram(env, "sendChatAction", { chat_id: message.chat.id, action: "typing", ...directMessageExtra(message) }).catch((error) => console.log("Channel DM typing skipped", error?.message || "unknown error"));
  }
  if (!message?.chat?.is_direct_messages) await Promise.all([rememberChat(env, message.chat), rememberUser(env, message.from)]);
  if (text.startsWith("/")) return handleCommand(env, message);
  const isGroup = ["group", "supergroup"].includes(message.chat?.type);
  const replyTarget = message.reply_to_message;
  let botMentioned = false;
  let queryText = text;
  if (isGroup && message.entities?.some((entity) => entity.type === "mention")) {
    try {
      const botUsername = (await getBotIdentity(env)).username;
      botMentioned = Boolean(botUsername && text.toLowerCase().includes(`@${String(botUsername).toLowerCase()}`));
      if (botMentioned) queryText = text.replace(`@${botUsername}`, "").replace(/\s+/g, " ").trim();
    } catch (error) {
      console.log("Bot mention check failed", error?.message || "unknown error");
    }
  }
  if (isGroup && replyTarget?.from && !replyTarget.from.is_bot && !botMentioned) return;
  const cleanup = { ...(isGroupMessage(message) ? { __deleteAfterSeconds: resultDeleteSeconds(env) } : {}), ...directMessageExtra(message) };
  const natural = extractNaturalSearchQuery(queryText);
  if (natural) {
    if (!allowCatalogSearch(message)) return null;
    const naturalRows = await searchBooks(env, natural.query);
    if (naturalRows.length) return sendSearch(env, message.chat.id, natural.query, cleanup, false, { user: message.from, chatType: message.chat?.type }, naturalRows, natural.requestedFormat);
    return sendSearch(env, message.chat.id, natural.query, cleanup, false, { user: message.from, chatType: message.chat?.type }, naturalRows, natural.requestedFormat);
  }
  if (isGroup && !botMentioned) {
    // Do not fuzzy-search every ordinary group message. The original bot
    // only searched an exact author/title in this fast path, and stayed
    // silent when there was no exact catalog match.
    if (!allowCatalogSearch(message)) return null;
    const exactRows = await searchExactBook(env, queryText);
    if (!exactRows.length) return null;
    return sendSearch(env, message.chat.id, queryText, cleanup, true, { user: message.from, chatType: message.chat?.type }, exactRows);
  }
  if (isGroup && !botMentioned) return null;
  if (!allowCatalogSearch(message)) return null;
  return sendSearch(env, message.chat.id, queryText, cleanup, false, { user: message.from, chatType: message.chat?.type });
}

async function handleCallback(env, query) {
  telegram(env, "answerCallbackQuery", { callback_query_id: query.id }).catch(() => {});
  const action = query.data;
  const message = query.message;
  if (!message) return;
  rememberChat(env, message.chat).catch(() => {});
  if (action === "help_search") return sendMessage(env, message.chat.id, "သုံးပုံ: /search စာအုပ်နာမည် သို့မဟုတ် စာရေးသူ");
  if (action === "help_authors") return handleCommand(env, { chat: message.chat, text: "/authors" });
  if (action === "help_books") return handleCommand(env, { chat: message.chat, text: "/books" });
  if (action === "help_stats") return handleCommand(env, { chat: message.chat, text: "/stats" });
  const secretaryMatch = String(action || "").match(/^secretary:(approve|reject):([a-f0-9]+)$/);
  if (secretaryMatch) return handleSecretaryCallback(env, query, secretaryMatch[2], secretaryMatch[1]);
  const deleteMatch = String(action || "").match(/^delete:(yes|no|pick):([a-z0-9]+)$/);
  if (deleteMatch) {
    const [, choice, token] = deleteMatch;
    const session = await env.DB.prepare("SELECT token,requester_id,chat_id,book_id FROM delete_sessions WHERE token=? AND created_at>? ")
      .bind(token, Math.floor(Date.now() / 1000) - 3600).first();
    if (!session) return sendMessage(env, message.chat.id, "ဒီဖျက်ရန် button သက်တမ်းကုန်သွားပါပြီရှင်။ စာအုပ်ကို ပြန်ရွေးပေးပါနော်။");
    const callbackAdmin = await catalogDeleteAllowed(env, { chat: message.chat, from: query.from });
    const sameRequester = String(session.requester_id) === String(query.from?.id);
    if (String(session.chat_id) !== String(message.chat.id) || (!sameRequester && !callbackAdmin)) {
      return sendMessage(env, message.chat.id, "ဒီစာအုပ်ဖျက်ရန် button ကို ရွေးထားတဲ့ admin ပဲ ဆက်လုပ်နိုင်ပါတယ်ရှင်။");
    }
    const book = await env.DB.prepare("SELECT id,author,title FROM books WHERE id=?").bind(session.book_id).first();
    if (!book) {
      await env.DB.prepare("DELETE FROM delete_sessions WHERE token=?").bind(token).run();
      return editMessage(env, message.chat.id, message.message_id, "ဒီစာအုပ်က catalog ထဲမှာ မရှိတော့ပါဘူးရှင်။");
    }
    if (choice === "pick") return sendDeleteConfirmation(env, { chat: message.chat, from: query.from }, book);
    await env.DB.prepare("DELETE FROM delete_sessions WHERE token=?").bind(token).run();
    if (choice === "no") return editMessage(env, message.chat.id, message.message_id, "မဖျက်တော့ပါဘူးရှင်။ စာအုပ်က catalog ထဲမှာ ဆက်ရှိနေပါမယ်။");
    await env.DB.prepare("DELETE FROM books WHERE id=?").bind(book.id).run();
    return editMessage(env, message.chat.id, message.message_id, `✅ <b>ဖျက်ပြီးပါပြီရှင်။</b>\n\n✍️ ${escapeHtml(book.author || "") }\n📖 ${escapeHtml(book.title || "") }\n\nChannel မူရင်း post ကတော့ မပျက်ပါဘူး။`);
  }
  const searchMatch = String(action || "").match(/^search:([a-z0-9]+):(\d+)$/);
  if (searchMatch) {
    const cachedQuery = searchSessionCache.get(searchMatch[1]);
    const session = cachedQuery ? { query: cachedQuery } : await env.DB.prepare("SELECT query FROM search_sessions WHERE token=? AND created_at>? ").bind(searchMatch[1], Math.floor(Date.now() / 1000) - 86400).first();
    if (!session) return sendMessage(env, message.chat.id, "ဒီရှာဖွေမှု button သက်တမ်းကုန်သွားပါပြီ။ ပြန်ရှာပါ။");
    const stored = String(session.query || "");
    let query;
    let exact;
    let mention = "";
    let introIndex = 0;
    let formatRequest = "";
    let cachedRows = null;
    try {
      const parsed = JSON.parse(stored);
      query = String(parsed.query || "");
      exact = Boolean(parsed.exact);
      mention = String(parsed.mention || "");
      introIndex = Number(parsed.introIndex) || 0;
      formatRequest = String(parsed.formatRequest || "");
      cachedRows = Array.isArray(parsed.rows) ? parsed.rows : null;
    } catch {
      exact = stored.startsWith("__exact__");
      query = stored.replace(/^__(?:exact|fuzzy)__/, "");
    }
    return sendSearchPage(env, message.chat.id, query, Number(searchMatch[2]), {}, exact, searchMatch[1], message.message_id, mention, introIndex, cachedRows, formatRequest);
  }
  const catalogMatch = String(action || "").match(/^catalog:(authors|books):(\d+)$/);
  if (catalogMatch) return catalogPage(env, message.chat.id, catalogMatch[1], Number(catalogMatch[2]), {}, message.message_id);
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(Promise.all([ensureWebhook(env), cleanupDue(env), sendMorningGreetings(env), pruneWebhookUpdates(env), syncPendingGitHub(env)]));
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
      if (update.inline_query) {
        ctx.waitUntil(handleInlineQuery(env, update.inline_query).catch((error) => console.error("Inline query handler failed", error?.message || "unknown error")));
      } else if (update.business_connection) {
        ctx.waitUntil(handleBusinessConnection(env, update.business_connection).catch((error) => console.error("Business connection handler failed", error?.message || "unknown error")));
      } else if (update.business_message || update.edited_business_message) {
        if (update.business_message) ctx.waitUntil(secretaryAutoReply(env, update.business_message).catch((error) => console.error("Secretary message handler failed", error?.message || "unknown error")));
      } else if (update.channel_post) {
        ctx.waitUntil(rememberChat(env, update.channel_post.chat));
        ctx.waitUntil(importChannelPost(env, update.channel_post).catch((error) => console.error("Channel import failed", error?.message || "unknown error")));
      } else if (update.callback_query) {
        ctx.waitUntil(handleCallback(env, update.callback_query).catch((error) => console.error("Callback failed", error?.message || "unknown error")));
      } else if (update.chat_member) {
        ctx.waitUntil(membershipEvent(env, update, "member_status_changed").catch((error) => console.error("Chat member audit failed", error?.message || "unknown error")));
      } else if (update.my_chat_member) {
        ctx.waitUntil(membershipEvent(env, update, "bot_status_changed").catch((error) => console.error("Bot status audit failed", error?.message || "unknown error")));
      } else if (update.edited_message) {
        ctx.waitUntil(auditAction(env, update.edited_message, "message_edited", null, `message_id=${update.edited_message.message_id}`).catch((error) => console.error("Edit audit failed", error?.message || "unknown error")));
      } else if (update.message) {
        const message = update.message;
        await rememberChat(env, message.chat);
        await enforceForwardPolicy(env, message).then(async (blocked) => {
          if (blocked) return null;
          if (message.text) {
            if (isGroupMessage(message) && autoDeleteEnabled(env) && message.text.trim().startsWith("/")) {
              await queueDelete(env, message.chat.id, message.message_id, commandDeleteSeconds(env));
            }
            return handleMessage(env, message);
          }
          return serviceEvent(env, message);
        }).catch((error) => console.error("Message handling failed", error?.message || "unknown error"));
      }
      return new Response("OK");
    } catch (error) {
      console.error(error);
      return new Response("OK");
    }
  },
};
