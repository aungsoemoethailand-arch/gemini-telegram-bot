# Telegram Book Bot — New Manus Account Handoff

ဒီဖိုင်က Manus account/chat အသစ်ကနေ လက်ရှိ Cloudflare Worker bot ကို ပြန်ဆက်သုံးရန်အတွက် ဖြစ်ပါတယ်။

## လက်ရှိ deployment အချက်အလက်

- GitHub repository: `aungsoemoethailand-arch/gemini-telegram-bot`
- Worker name: `gemini-telegram-webhook`
- Worker URL: `https://gemini-telegram-webhook.aungsoemoe-thailand.workers.dev`
- D1 database name: `gemini-telegram-catalog`
- D1 database ID: `1a7d4522-0704-4d75-978f-6083be245458`
- Current mode: catalog search only
- Pagination: 10 books per page
- `/ask` and AI review/info mode: disabled
- Auto-delete: disabled
- Morning greeting: disabled
- Welcome/goodbye messages: disabled
- Scheduled maintenance: hourly
- Search burst limit: 4 searches per user/group pair per 10 seconds

## အရေးကြီးသော လုံခြုံရေးစည်းကမ်း

အောက်ပါ secret များကို GitHub, chat, Markdown file, `wrangler.toml` သို့ မထည့်ရပါ။

- `CLOUDFLARE_API_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_SECRET_TOKEN` (အသုံးပြုထားလျှင်)
- အနာဂတ်တွင် ပြန်ဖွင့်မည့် `AI_API_KEY`

လက်ရှိ Worker ထဲက secrets တွေကို `wrangler deploy --keep-vars` သုံးပြီး ထိန်းသိမ်းနိုင်ပါတယ်။ Cloudflare API token ကို Cloudflare က ပြန်ဖတ်ပြမပေးပါ။ မေ့သွားရင် token အသစ်ထုတ်ရပါမယ်။ Account တူရင် token အသစ်က အဲဒီ Account/Worker/D1 ကို ဆက်ထိန်းနိုင်ပါတယ်။

## Account အသစ်ကနေ ဆက်ရန်

### 1. Manus account အသစ်မှာ connector နှစ်ခုဖွင့်ပါ

- GitHub connector — repository clone/push အတွက်
- Cloudflare API သို့မဟုတ် Cloudflare Worker connector — deploy/D1 အတွက်

Chat ကို share လုပ်တာနဲ့ credentials မကူးပါ။ Account အသစ်မှာ connector authorization ကို တစ်ကြိမ်ပြန်လုပ်ရပါမယ်။

### 2. Repository ကို clone လုပ်ပါ

```bash
gh repo clone aungsoemoethailand-arch/gemini-telegram-bot
cd gemini-telegram-bot/cloudflare-worker
```

### 3. Cloudflare API token အသစ်ဖန်တီးပါ

Cloudflare Dashboard → **My Profile → API Tokens → Create Token** မှာ token အသစ်ထုတ်ပါ။

အနည်းဆုံး လိုအပ်သော permissions:

- Account — Workers Scripts: Edit
- Account — D1: Edit
- လိုအပ်ပါက Account Settings: Read

Token ကို chat/GitHub ထဲ မပို့ပါနဲ့။ New Manus sandbox ရဲ့ environment secret အဖြစ် ထည့်ပြီး `wrangler` က အသုံးပြုပါ။

```bash
export CLOUDFLARE_API_TOKEN='အသစ်ထုတ်ထားသော token ကို local environment တွင်သာထည့်ပါ'
```

> `CLOUDFLARE_API_TOKEN` ကို message, commit, screenshot, public log ထဲ မထည့်ပါနဲ့။

### 4. Existing Worker ကို deploy လုပ်ပါ

အောက်ပါ command က Cloudflare Worker ထဲမှာ ရှိပြီးသား runtime variables/secrets ကို မဖျက်ဘဲ code ကို deploy လုပ်ပါတယ်။

```bash
npx wrangler deploy --keep-vars --no-bundle
```

ဒီ command မလုပ်ခင် `CLOUDFLARE_API_TOKEN` က လက်ရှိ Cloudflare account အတွက်ဖြစ်ရပါမယ်။

### 5. Runtime secret မရှိတော့မှသာ ပြန်ထည့်ပါ

လက်ရှိ Worker မှာ secrets ရှိနေသေးရင် `--keep-vars` ကြောင့် ပြန်ထည့်ရန် မလိုပါ။ Secret ပျောက်သွားမှသာ—

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_SECRET_TOKEN
```

`AI_API_KEY` က catalog-only mode မှာ မလိုအပ်ပါ။ `/ask`/AI mode ကို ပြန်ဖွင့်မယ်ဆိုမှသာ ထည့်ပါ။

### 6. D1 migration စစ်ရန်

လက်ရှိ migration files အားလုံး repo ထဲမှာ ရှိပြီးသားပါ။ Existing production D1 ကို မဖျက်ဘဲ စစ်ဆေးရန်:

```bash
npx wrangler d1 migrations list gemini-telegram-catalog --remote
```

D1 database အသစ်ဖန်တီးပြီး migration ပြန်လုပ်ခြင်းကို မလုပ်ပါနှင့်။ အဲဒါက catalog data မပါသော database အသစ် ဖြစ်သွားနိုင်ပါတယ်။

## Token မေ့သွားရင်

Cloudflare API token အဟောင်းကို ပြန်ကြည့်လို့ မရပါ။

- Worker/D1 မပျောက်ပါ
- Cloudflare account တူနေပါက token အသစ်ဖန်တီးပြီး ဆက် deploy လုပ်နိုင်ပါသည်
- Token အဟောင်းကို revoke လုပ်နိုင်ပါသည်
- Telegram bot token ကို မပြောင်းလျှင် Worker secret ကို ပြန်ထည့်ရန် မလိုပါ

## မလုပ်ရမည့်အရာများ

- API token ကို GitHub public repository ထဲ commit မလုပ်ရန်
- `.env` file ကို commit မလုပ်ရန်
- `wrangler.toml` ထဲ secret တန်ဖိုးထည့်မထားရန်
- D1 database file ကို source repository ထဲ မကူးရန်
- Existing D1 ကို delete/recreate မလုပ်ရန်
- `--keep-vars` မပါဘဲ production deploy မလုပ်ရန်

## လုံခြုံသော အခြေအနေအကျဉ်း

Repo ထဲတွင် source code, migrations, non-secret Worker configuration နှင့် deploy instructions သာရှိပါသည်။ Telegram token၊ Cloudflare API token နှင့် အခြား runtime secrets များကို repo ထဲ မသိမ်းထားပါ။
