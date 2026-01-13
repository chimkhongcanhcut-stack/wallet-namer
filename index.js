require("dotenv").config();
const { Telegraf } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// Parse allowed groups
const ALLOWED = (process.env.ALLOWED_CHAT_IDS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

// RAM state per group
// chatId => { seq, totalSaved, pendingSave }
const RAM = new Map();

function isAllowed(ctx) {
  return ALLOWED.includes(String(ctx.chat?.id || ""));
}

function bucket(chatId) {
  if (!RAM.has(chatId)) RAM.set(chatId, { seq: 0, totalSaved: 0, pendingSave: null });
  return RAM.get(chatId);
}

function extractWallets(text) {
  const re = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return String(text)
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => re.test(x));
}

// ===== Commands =====
bot.start((ctx) => {
  if (!isAllowed(ctx)) return;
  ctx.reply(
    "🔒 Wallet Namer BOT (Multi-Group)\n\n" +
      "• /save <name> → reply vào tin nhắn bot trong 15s để paste ví\n" +
      "• /reset → reset số đếm\n" +
      "• /stats → xem tổng"
  );
});

bot.command("reset", (ctx) => {
  if (!isAllowed(ctx)) return;
  const b = bucket(ctx.chat.id);
  b.seq = 0;
  b.pendingSave = null;
  ctx.reply("🔁 Reset xong, lần sau bắt đầu từ 1");
});

bot.command("stats", (ctx) => {
  if (!isAllowed(ctx)) return;
  const b = bucket(ctx.chat.id);
  ctx.reply(`📊 seq=${b.seq} | total=${b.totalSaved}`);
});

bot.command("save", async (ctx) => {
  if (!isAllowed(ctx)) return;

  const name = ctx.message.text.replace(/^\/save(@\w+)?\s*/i, "").trim();
  if (!name) return ctx.reply("Dùng: /save <name>");

  const b = bucket(ctx.chat.id);
  const msg = await ctx.reply(`⏳ Reply tin nhắn này trong 15s\nName: ${name}`);
  b.pendingSave = { name, until: Date.now() + 15000, replyMsgId: msg.message_id };
});

// ===== Only accept reply =====
bot.on("text", (ctx) => {
  if (!isAllowed(ctx)) return;

  const b = bucket(ctx.chat.id);
  if (!b.pendingSave || Date.now() > b.pendingSave.until) return;

  const replyTo = ctx.message?.reply_to_message?.message_id;
  if (replyTo !== b.pendingSave.replyMsgId) return;

  const wallets = extractWallets(ctx.message.text);
  if (!wallets.length) return;

  const out = [];
  for (const w of wallets) {
    b.seq++;
    b.totalSaved++;
    out.push(`${w} ${b.pendingSave.name} ${b.seq}`);
  }

  b.pendingSave = null;
  ctx.reply(out.join("\n"));
});

bot.launch();
