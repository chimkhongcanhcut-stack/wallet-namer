require("dotenv").config();
const { Telegraf } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// chatId => { seq, pendingSave }
const RAM = new Map();

// ================= utils =================
function bucket(chatId) {
  if (!RAM.has(chatId)) RAM.set(chatId, { seq: 0, pendingSave: null });
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
  ctx.reply("⚡ Wallet Namer BOT (RAM ONLY)\n\n/save <name> rồi paste ví vào trong 15s")
);

bot.command("save", (ctx) => {
  const name = ctx.message.text.replace(/^\/save\s*/i, "").trim();
  if (!name) return ctx.reply("Dùng: /save <name>");

  const b = bucket(ctx.chat.id);
  b.pendingSave = { name, until: Date.now() + 15000 };

  ctx.reply(`⏳ Paste ví trong 15s\nName: ${name}`);
});

// ================= paste listener =================
bot.on("text", (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return;

  const b = bucket(ctx.chat.id);
  if (!b.pendingSave || Date.now() > b.pendingSave.until) return;

  const wallets = extractWallets(text);
  if (!wallets.length) return;

  let out = [];
  for (const w of wallets) {
    b.seq++;
    out.push(`${w} ${b.pendingSave.name} ${b.seq}`);
  }

  b.pendingSave = null;
  ctx.reply(out.join("\n"));
});

bot.launch();
