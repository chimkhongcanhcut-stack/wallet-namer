require("dotenv").config();
const { Telegraf } = require("telegraf");
const https = require("https");
const http = require("http");

// ================== ENV ==================
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ Missing BOT_TOKEN in .env");
  process.exit(1);
}

const ALLOWED = (process.env.ALLOWED_CHAT_IDS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

if (ALLOWED.length === 0) {
  console.error("❌ Missing ALLOWED_CHAT_IDS in .env");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ================== PRIVATE GROUP GUARD ==================
bot.use((ctx, next) => {
  const chatId = String(ctx.chat?.id || "");
  if (!ALLOWED.includes(chatId)) {
    if (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup") {
      ctx.reply("mày chưa được cấp quyền để dùng bot, tìm @mjiohaa trên telegram để mua bot.");
    }
    return;
  }
  return next();
});

// ================== RAM STATE ==================
const RAM = new Map();

function isAllowed(ctx) {
  return ALLOWED.includes(String(ctx.chat?.id || ""));
}

function bucket(chatId) {
  if (!RAM.has(chatId)) {
    RAM.set(chatId, {
      seq: 0,
      totalSaved: 0,
      pendingSave: null,
    });
  }
  return RAM.get(chatId);
}

// ================== HELPERS ==================

// detect sol wallet
function extractWallets(text) {
  const re = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
  return [...new Set(String(text || "").match(re) || [])];
}

// BUILD OUTPUT (NO /add)
function buildOutput(wallets, name, b) {
  const out = [];
  for (const w of wallets) {
    b.seq++;
    b.totalSaved++;
    out.push(`${w} ${name} ${b.seq}`);
  }
  return out;
}

function sendLargeTextOrFile(ctx, out, name) {
  const text = out.join("\n");
  const MAX_TG = 3900;

  if (text.length <= MAX_TG) {
    return ctx.reply(text);
  }

  const filename = `saved_${name}_${Date.now()}.txt`;
  const header =
    `✅ Saved ${out.length} wallets\n` +
    `Name: ${name}\n` +
    `Format: <wallet> <name> <seq>\n` +
    `---\n`;

  const fileBuf = Buffer.from(header + text + "\n", "utf8");

  return Promise.all([
    ctx.reply(`📄 Output dài quá (${text.length} chars) → gửi file .txt nha 😄`),
    ctx.replyWithDocument({ source: fileBuf, filename }),
  ]);
}

async function downloadFileBuffer(fileUrl) {
  return new Promise((resolve, reject) => {
    const client = fileUrl.startsWith("https://") ? https : http;

    client
      .get(fileUrl, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }

        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

async function handleWalletText(ctx, rawText, name) {
  const b = bucket(ctx.chat.id);
  const wallets = extractWallets(rawText);

  if (!wallets.length) {
    return ctx.reply("❌ Không tìm thấy wallet hợp lệ.");
  }

  const out = buildOutput(wallets, name, b);
  b.pendingSave = null;

  await ctx.reply(`✅ Đã đọc ${wallets.length} wallet`);
  return sendLargeTextOrFile(ctx, out, name);
}

// ================== COMMANDS ==================

bot.start((ctx) => {
  if (!isAllowed(ctx)) return;

  ctx.reply(
    "🔒 Wallet Namer BOT\n\n" +
      "• /save <name> → reply trong 15s\n" +
      "• Có thể paste text hoặc gửi file .txt\n" +
      "• /reset → reset\n" +
      "• /stats → thống kê\n\n" +
      "Format:\n<wallet> <name> <seq>"
  );
});

bot.command("reset", (ctx) => {
  if (!isAllowed(ctx)) return;
  const b = bucket(ctx.chat.id);
  b.seq = 0;
  b.pendingSave = null;
  ctx.reply("🔁 Reset xong");
});

bot.command("stats", (ctx) => {
  if (!isAllowed(ctx)) return;
  const b = bucket(ctx.chat.id);
  ctx.reply(`📊 seq=${b.seq} | total=${b.totalSaved}`);
});

bot.command("save", async (ctx) => {
  if (!isAllowed(ctx)) return;

  const name = String(ctx.message?.text || "")
    .replace(/^\/save(@\w+)?\s*/i, "")
    .trim();

  if (!name) return ctx.reply("Dùng: /save <name>");

  const b = bucket(ctx.chat.id);
  const msg = await ctx.reply(
    `⏳ Reply trong 15s\nName: ${name}\n\n` +
      "• Paste ví\n• Hoặc gửi file .txt"
  );

  b.pendingSave = {
    name,
    until: Date.now() + 15000,
    replyMsgId: msg.message_id,
  };
});

// ================== TEXT ==================
bot.on("text", async (ctx) => {
  try {
    if (!isAllowed(ctx)) return;

    const b = bucket(ctx.chat.id);
    if (!b.pendingSave || Date.now() > b.pendingSave.until) return;

    const replyTo = ctx.message?.reply_to_message?.message_id;
    if (replyTo !== b.pendingSave.replyMsgId) return;

    const wallets = extractWallets(ctx.message.text);
    if (!wallets.length) return;

    const out = buildOutput(wallets, b.pendingSave.name, b);
    b.pendingSave = null;

    await ctx.reply(`✅ ${wallets.length} wallets`);
    return sendLargeTextOrFile(ctx, out, b.pendingSave?.name);
  } catch (err) {
    console.error(err);
    ctx.reply("❌ lỗi text");
  }
});

// ================== TXT FILE ==================
bot.on("document", async (ctx) => {
  try {
    if (!isAllowed(ctx)) return;

    const b = bucket(ctx.chat.id);
    if (!b.pendingSave || Date.now() > b.pendingSave.until) return;

    const replyTo = ctx.message?.reply_to_message?.message_id;
    if (replyTo !== b.pendingSave.replyMsgId) return;

    const doc = ctx.message.document;
    const fileName = (doc.file_name || "").toLowerCase();

    if (!fileName.endsWith(".txt")) {
      return ctx.reply("❌ chỉ nhận .txt");
    }

    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const buf = await downloadFileBuffer(fileLink.toString());
    const text = buf.toString("utf8");

    return handleWalletText(ctx, text, b.pendingSave.name);
  } catch (err) {
    console.error(err);
    ctx.reply("❌ lỗi đọc file");
  }
});

// ================== BOOT ==================
bot.launch();
console.log("✅ Bot started");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
