require("dotenv").config();
const { Telegraf } = require("telegraf");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ALLOWED_CHAT_ID = String(process.env.ALLOWED_CHAT_ID || "").trim();

if (!BOT_TOKEN) {
  console.error("❌ Missing BOT_TOKEN");
  process.exit(1);
}
if (!ALLOWED_CHAT_ID) {
  console.error("❌ Missing ALLOWED_CHAT_ID in .env");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// chatId => { seq, totalSaved, pendingSave: {name, until, replyMsgId} }
const RAM = new Map();

function isAllowed(ctx) {
  const chatId = String(ctx.chat?.id ?? "");
  return chatId === ALLOWED_CHAT_ID;
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
    "🔒 Wallet Namer BOT (Group-Only)\n\n" +
      "• /save <name> → bot sẽ gửi 1 message, bạn REPLY vào đó để paste ví (trong 15s)\n" +
      "• /reset → reset số đếm\n" +
      "• /stats → xem tổng\n" +
      "• /chatid → xem ID group"
  );
});

bot.command("chatid", (ctx) => {
  if (!isAllowed(ctx)) return;
  ctx.reply(`🆔 Chat ID: ${ctx.chat.id}`);
});

bot.command("reset", (ctx) => {
  if (!isAllowed(ctx)) return;
  const b = bucket(ctx.chat.id);
  b.seq = 0;
  b.pendingSave = null;
  ctx.reply("🔁 Reset xong ✅ (lần lưu tiếp theo bắt đầu từ 1)");
});

bot.command("stats", (ctx) => {
  if (!isAllowed(ctx)) return;
  const b = bucket(ctx.chat.id);
  ctx.reply(
    `📊 Stats:\n` +
      `• seq hiện tại: ${b.seq}\n` +
      `• tổng ví đã lưu (từ lúc bot chạy): ${b.totalSaved}`
  );
});

bot.command("save", async (ctx) => {
  if (!isAllowed(ctx)) return;

  const name = String(ctx.message.text || "").replace(/^\/save(@\w+)?\s*/i, "").trim();
  if (!name) return ctx.reply("Dùng: /save <name>\nVí dụ: /save Tao là bố mày");

  const b = bucket(ctx.chat.id);
  const until = Date.now() + 15000;

  // Bot gửi 1 message để bạn REPLY vào (an toàn, không cần tắt Privacy Mode)
  const msg = await ctx.reply(
    `⏳ OK! Reply tin nhắn này và paste ví trong 15s\n🏷️ Name: ${name}`
  );

  b.pendingSave = { name, until, replyMsgId: msg.message_id };
});

// ===== Only process replies to bot's save message =====
bot.on("text", (ctx) => {
  if (!isAllowed(ctx)) return;

  const b = bucket(ctx.chat.id);
  if (!b.pendingSave) return;

  // hết hạn
  if (Date.now() > b.pendingSave.until) {
    b.pendingSave = null;
    return;
  }

  // phải là reply vào đúng message bot vừa gửi
  const replyToId = ctx.message?.reply_to_message?.message_id;
  if (!replyToId || replyToId !== b.pendingSave.replyMsgId) return;

  const wallets = extractWallets(ctx.message.text);
  if (!wallets.length) return;

  const out = [];
  for (const w of wallets) {
    b.seq++;
    b.totalSaved++;
    out.push(`${w} ${b.pendingSave.name} ${b.seq}`);
  }

  b.pendingSave = null; // auto close sau 1 lần reply
  ctx.reply(out.join("\n"));
});

bot.launch().then(() => console.log("✅ Group-only Wallet Namer Bot running"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
