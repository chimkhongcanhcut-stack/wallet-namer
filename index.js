require("dotenv").config();
const { Telegraf } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// chatId => { seq, totalSaved, pendingSave }
const RAM = new Map();

// ================= utils =================
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

// ================= commands =================
bot.start((ctx) =>
  ctx.reply(
    "⚡ Wallet Namer BOT (RAM ONLY)\n\n" +
      "✅ /save <name> rồi paste ví trong 15s\n" +
      "🔁 /reset để reset số đếm\n" +
      "📊 /stats để xem tổng ví đã lưu"
  )
);

bot.command("save", (ctx) => {
  const name = ctx.message.text.replace(/^\/save(@\w+)?\s*/i, "").trim();
  if (!name) return ctx.reply("Dùng: /save <name>\nVí dụ: /save Tao là bố mày");

  const b = bucket(ctx.chat.id);
  b.pendingSave = { name, until: Date.now() + 15000 };

  ctx.reply(`⏳ Paste ví trong 15s\n🏷️ Name: ${name}`);
});

bot.command("reset", (ctx) => {
  const b = bucket(ctx.chat.id);
  b.seq = 0;
  b.pendingSave = null;
  ctx.reply("🔁 Đã reset số đếm về 0. Lần lưu tiếp theo sẽ bắt đầu từ 1 ✅");
});

bot.command("stats", (ctx) => {
  const b = bucket(ctx.chat.id);
  ctx.reply(
    `📊 Stats (chat này):\n` +
      `• Đếm hiện tại (seq): ${b.seq}\n` +
      `• Tổng ví đã lưu (từ lúc bot chạy): ${b.totalSaved}`
  );
});

// ================= paste listener =================
bot.on("text", (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return;

  const b = bucket(ctx.chat.id);

  // phải đang ở save-mode và còn hạn 15s
  if (!b.pendingSave || Date.now() > b.pendingSave.until) return;

  const wallets = extractWallets(text);
  if (!wallets.length) return;

  const out = [];
  for (const w of wallets) {
    b.seq++;
    b.totalSaved++;
    out.push(`${w} ${b.pendingSave.name} ${b.seq}`);
  }

  // auto close save-mode sau 1 lần paste
  b.pendingSave = null;

  ctx.reply(out.join("\n"));
});

bot.launch().then(() => console.log("✅ Wallet Namer Bot running"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
