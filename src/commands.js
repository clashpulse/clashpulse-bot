import { InlineKeyboard } from "grammy";

const API = "https://api.clashofclans.com/v1";
const CONTACT = "hojam";

// Tugma bosilgandan keyin foydalanuvchi tegni yuborishini kutish
const waiting = new Map();
const cid = (ctx) => ctx.chat?.id ?? ctx.from?.id;

async function coc(path) {
  const token = process.env.COC_API_TOKEN;
  if (!token) return { error: "COC_API_TOKEN topilmadi." };
  try {
    const res = await fetch(API + path, {
      headers: { Authorization: "Bearer " + token },
    });
    if (res.status === 404) return { error: "Topilmadi. Tegni tekshiring." };
    if (res.status === 403)
      return { error: "API ruxsat bermadi (403). IP yoki kalitni tekshiring." };
    if (res.status === 429)
      return { error: "So'rovlar ko'p. Birozdan keyin urinib ko'ring." };
    if (!res.ok) return { error: "API xatosi: " + res.status };
    return { data: await res.json() };
  } catch (e) {
    return { error: "Ulanishda xato. Keyinroq urinib ko'ring." };
  }
}

function cleanTag(text) {
  const t = (text || "").trim().toUpperCase().replace(/^#/, "").replace(/O/g, "0");
  if (!/^[0289PYLQGRJCUV]{3,12}$/.test(t)) return null;
  return "#" + t;
}

const n = (x) => Number(x || 0).toLocaleString("en-US");

const bar = (p) => {
  const f = Math.max(0, Math.min(10, Math.round(p / 10)));
  return "█".repeat(f) + "░".repeat(10 - f);
};

function progressOf(list) {
  const mx = list.reduce((s, x) => s + (x.maxLevel || 0), 0);
  const lv = list.reduce(
    (s, x) => s + Math.min(x.level || 0, x.maxLevel || 0),
    0,
  );
  return mx ? Math.round((lv / mx) * 100) : null;
}

function progressLine(label, list) {
  const p = progressOf(list);
  return p === null ? null : label + ": " + bar(p) + " " + p + "%";
}

async function playerReport(tag) {
  const { data: p, error } = await coc("/players/" + encodeURIComponent(tag));
  if (error) return { error };

  const home = (arr) => (arr || []).filter((x) => x.village === "home");
  const heroes = home(p.heroes);
  const troops = home(p.troops).filter((x) => !x.name.startsWith("Super "));
  const spells = home(p.spells);
  const equip = p.heroEquipment || [];
  const all = [...heroes, ...troops, ...spells, ...equip];
  const total = progressOf(all);

  const ratio = p.donationsReceived
    ? (p.donations / p.donationsReceived).toFixed(2)
    : String(p.donations || 0);
  const labels = (p.labels || []).map((l) => l.name).join(", ");

  const part1 = [
    "👤 " + p.name + " (" + p.tag + ")",
    "",
    "🏰 Town Hall: " + p.townHallLevel + (p.townHallWeaponLevel ? " (qurol " + p.townHallWeaponLevel + ")" : ""),
    "⭐ Daraja: " + p.expLevel,
    p.league ? "🏅 Liga: " + p.league.name : null,
    "🏆 Kubok: " + n(p.trophies) + " (eng yuqori: " + n(p.bestTrophies) + ")",
    "⚔️ Urush yulduzlari: " + n(p.warStars),
    "🗡 Hujum g'alabalari: " + n(p.attackWins),
    "🛡 Mudofaa g'alabalari: " + n(p.defenseWins),
    "🤝 Donat: berilgan " + n(p.donations) + ", olingan " + n(p.donationsReceived) + " (nisbat " + ratio + ")",
    "🏛 Capital hissasi: " + n(p.clanCapitalContributions),
    p.builderHallLevel
      ? "🏗 Builder Base: BH " + p.builderHallLevel + ", kubok " + n(p.builderBaseTrophies) + " (eng yuqori " + n(p.bestBuilderBaseTrophies) + ")"
      : null,
    "🏷 Klan: " + (p.clan ? p.clan.name + " (" + (p.role || "a'zo") + ")" : "klanda emas"),
    p.warPreference ? "🚩 Urushga munosabat: " + p.warPreference : null,
    labels ? "🔖 Belgilar: " + labels : null,
  ]
    .filter((x) => x !== null)
    .join("\n");

  const weak = all
    .filter((x) => x.level < x.maxLevel)
    .sort((a, b) => a.level / a.maxLevel - b.level / b.maxLevel)
    .slice(0, 5)
    .map((x) => "• " + x.name + ": " + x.level + "/" + x.maxLevel)
    .join("\n");

  const part2 = [
    "📊 Rivojlanish (joriy Town Hall maksimumiga nisbatan)",
    "",
    total !== null ? "Qo'shin va qahramonlar bo'yicha: " + bar(total) + " " + total + "%" : null,
    progressLine("🦸 Qahramonlar", heroes),
    progressLine("🪖 Qo'shinlar", troops),
    progressLine("🧪 Sehrlar", spells),
    progressLine("🛠 Jihozlar", equip),
    "",
    heroes.length
      ? "Qahramonlar:\n" + heroes.map((h) => "• " + h.name + ": " + h.level + "/" + h.maxLevel).join("\n")
      : null,
    weak ? "\n⚠️ Eng orqada qolganlar:\n" + weak : null,
  ]
    .filter((x) => x !== null)
    .join("\n");

  const wanted = ["Conqueror", "Unbreakable", "Friend in Need", "Games Champion"];
  const ach = (p.achievements || [])
    .filter((a) => wanted.includes(a.name))
    .map((a) => "• " + a.name + ": " + n(a.value))
    .join("\n");

  const tips = [];
  const hp = progressOf(heroes);
  if (hp !== null && hp < 70)
    tips.push("Qahramonlar maksimumdan ancha orqada, ularni yangilashga ustuvorlik bering.");
  if (p.donationsReceived > 0 && p.donations / p.donationsReceived < 0.5)
    tips.push("Donat nisbati past, klan a'zolariga ko'proq qo'shin bering.");
  if (!p.clan)
    tips.push("Klanda emassiz. Klanda donat va urush imkoniyatlari ko'proq bo'ladi.");
  if (p.bestTrophies && p.trophies < p.bestTrophies * 0.8)
    tips.push("Hozirgi kubok eng yuqori natijadan ancha past.");
  if (total !== null && total >= 90)
    tips.push("Town Hall uchun deyarli maksimumdasiz, keyingisiga o'tishga tayyorsiz.");

  const part3 = [
    ach ? "🎖 Yutuqlar:\n" + ach : null,
    tips.length ? "\n💡 Maslahatlar:\n" + tips.map((t) => "• " + t).join("\n") : null,
  ]
    .filter((x) => x !== null)
    .join("\n");

  const parts = [part1, part2];
  if (part3.trim()) parts.push(part3.trim());
  return { parts, clanTag: p.clan ? p.clan.tag : null };
}

async function clanReport(tag) {
  const { data: c, error } = await coc("/clans/" + encodeURIComponent(tag));
  if (error) return { error };

  const members = c.memberList || [];
  const cnt = members.length;
  const sum = (f) => members.reduce((s, m) => s + (f(m) || 0), 0);
  const totalDon = sum((m) => m.donations);
  const totalRec = sum((m) => m.donationsReceived);
  const avgTr = cnt ? Math.round(sum((m) => m.trophies) / cnt) : 0;
  const avgDon = cnt ? Math.round(totalDon / cnt) : 0;
  const inactive = members.filter((m) => !m.donations).length;
  const activePct = cnt ? Math.round(((cnt - inactive) / cnt) * 100) : 0;

  const roles = {};
  members.forEach((m) => {
    roles[m.role] = (roles[m.role] || 0) + 1;
  });
  const leader = members.find((m) => m.role === "leader");

  const games = (c.warWins 'oshin' bering.");
  if (!0) + (c.warTies || 0);
  const winRate =
    c.isWarLogPublic && games
      ? Math.round(((c.warWins || 0) / games) * 100) + "%"
      : "noma'lum (urush logi yopiq)";

  const desc = c.description ? c.description.slice(0, 150) : "";

  const part1 = [
    "🛡 " + c.name + " (" + c.tag + ")",
    desc ? "📝 " + desc : null,
    "",
    "📈 Daraja: " + c.clanLevel,
    "👥 A'zolar: " + c.members + "/50",
    leader ? "👑 Lider: " + leader.name : null,
    c.location ? "🌍 Joylashuv: " + c.location.name : null,
    "🔓 Turi: " + c.type,
    "🏆 Klan ballari: " + n(c.clanPoints),
    c.requiredTrophies ? "🎯 Talab: " + n(c.requiredTrophies) + " kubok" : null,
    c.requiredTownhallLevel ? "🏰 Talab: TH " + c.requiredTownhallLevel : null,
    c.warLeague ? "🏅 Urush ligasi: " + c.warLeague.name : null,
    c.capitalLeague ? "🏛 Capital ligasi: " + c.capitalLeague.name : null,
    c.clanCapital && c.clanCapital.capitalHallLevel
      ? "🏛 Capital Hall: " + c.clanCapital.capitalHallLevel
      : null,
  ]
    .filter((x) => x !== null)
    .join("\n");

  const part2 = [
    "⚔️ Urush statistikasi",
    "",
    "G'alaba: " + n(c.warWins) + (c.isWarLogPublic ? ", durang: " + n(c.warTies) + ", mag'lubiyat: " + n(c.warLosses) : ""),
    "G'alaba foizi: " + winRate,
    "🔥 G'alaba seriyasi: " + n(c.warWinStreak),
    "Urush chastotasi: " + (c.warFrequency || "noma'lum"),
    "",
    "📊 A'zolar tahlili",
    "",
    "O'rtacha kubok: " + n(avgTr),
    "Jami donat: " + n(totalDon) + " (olingan " + n(totalRec) + ")",
    "O'rtacha donat: " + n(avgDon),
    "Faol (donat bergan): " + activePct + "% (" + inactive + " ta passiv)",
    "Rollar: lider " + (roles.leaderl ? null : label + ": " + bar(p) + " " + 0) + ", oqsoqol " + (roles.admingrammy";

const API = "https://api.cla0),
  ].join("\n");

  const top10 = [...members]
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, 10)
    .map((m, i) => (i + 1) + ". " + m.name + " - " + n(m.trophies))
    .join("\n");

  const topDon = [...members]
    .sort((a, b) => b.donations - a.donations)
    .slice(0, 5)
    .map((m, i) => (i + 1) + ". " + m.name + " - " + n(m.donations))
    .join("\n");

  const takers = members
    .filter((m) => m.donationsReceived > m.donations)
    .sort(
      (a, b) =>
        b.donationsReceived - b.donations - (a.donationsReceived - a.donations),
    )
    .slice(0, 3)
    .map((m) => "• " + m.name + ": berdi " + n(m.donations) + ", oldi " + n(m.donationsReceived))
    .join("\n");

  const w = await coc("/clans/" + encodeURIComponent(tag) + "/currentwar");
  let warText = "";
  if (w.data && w.data.state && w.data.state !== "notInWar") {
    const st =
      { preparation: "tayyorgarlik", inWar: "urush ketmoqda", warEnded: "urush tugadi" }[w.data.state] || w.data.state;
    warText =
      "\n\n⚔️ Joriy urush: " + st + "\n" +
      w.data.clan.name + " " + (w.data.clan.starsPYLQGRJCUV]{3,12}$/.test(t)) return null;
  return "#" + t;
0).toFixed(1) + "%\n" +
      "vs " + w.data.opponent.name + " " + (w.data.opponent.starsconst CONTACT = "hojam";

// Tugma bosilgandan keyin foydalanuvc0).toFixed(1) + "%";
  }

  const part3 =
    "🥇 Top 10 (kubok bo'yicha):\n" + top10 +
    "\n\n🤝 Top 5 donat beruvchi:\n" + topDon +
    (takers ? "\n\n📥 Berganidan ko'p olganlar:\n" + takers : "") +
    warText;

  return { parts: [part1, part2, part3] };
}

const homeBtn = () => new InlineKeyboard().text("🏠 Bosh menyu", "menu");

function mainMenu() {
  return new InlineKeyboard()
    .text("👤 O'yinchi tahlili", "player")
    .text("🛡 Klan tahlili", "clan")
    .row()
    .text("💎 Planlar", "plans")
    .text("ℹ️ Yordam", "help");
}

function helpKeyboard() {
  return new InlineKeyboard()
    .url("📩 Murojaat: @" + CONTACT, "https://t.me/" + CONTACT)
    .row()
    .text("🏠 Bosh menyu", "menu");
}

const HELP_TEXT =
  "ℹ️ Yordam\n\n" +
  "ClashPulse - Clash of Clans o'yinchilari va klanlari uchun tahlil boti.\n\n" +
  "Qanday ishlatiladi:\n" +
  "1. \"O'yinchi tahlili\" yoki \"Klan tahlili\" tugmasini bosing\n" +
  "2. Tegni yuboring, masalan: #ABC123\n\n" +
  "Tegni topish: o'yinda profilingizni oching, teg ismingiz ostida yoziladi.\n\n" +
  "Buyruqlar:\n" +
  "/start - Bosh menyu\n" +
  "/player #TAG - O'yinchi tahlili\n" +
  "/clan #TAG - Klan tahlili\n" +
  "/plans - Planlar\n" +
  "/help - Yordam\n" +
  "/ping - Bot holatini tekshirish\n\n" +
  "📩 Murojaat va takliflar uchun: @" + CONTACT;

const PLANS_TEXT =
  "💎 Planlar\n\nBu bo'lim tez orada to'ldiriladi. Yangiliklardan xabardor bo'ling!";

async function sendParts(ctx, parts, keyboard) {
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    await ctx.reply(
      parts[i],
      last && keyboard ? { reply_markup: keyboard } : undefined,
    );
  }
}

async function sendPlayer(ctx, tag) {
  try {
    await ctx.replyWithChatAction("typing").catch(() => {});
    const r = await playerReport(tag);
    if (r.error) return ctx.reply("❌ " + r.error, { reply_markup: homeBtn() });
    const kb = new InlineKeyboard();
    if (r.clanTag) kb.text("🛡 Klanni tahlil qilish", "t:c:" + r.clanTag).row();
    kb.text("🏠 Bosh menyu", "menu");
    return sendParts(ctx, r.parts, kb);
  } catch (e) {
    return ctx.reply("❌ Kutilmagan xato. Keyinroq urinib ko'ring.");
  }
}

async function sendClan(ctx, tag) {
  try {
    await ctx.replyWithChatAction("typing").catch(() => {});
    const r = await clanReport(tag);
    if (r.error) return ctx.reply("❌ " + r.error, { reply_markup: homeBtn() });
    return sendParts(ctx, r.parts, homeBtn());
  } catch (e) {
    return ctx.reply("❌ Kutilmagan xato. Keyinroq urinib ko'ring.");
  }
}

function showMenu(ctx) {
  waiting.delete(cid(ctx));
  return ctx.reply(
    "Salom, " + (ctx.from?.first_name ?? "do'st") + "!\n\n" +
      "Men ClashPulse botman. Clash of Clans o'yinchi va klanlarini tahlil qilaman.\n\n" +
      "Kerakli bo'limni tanlang:",
    { reply_markup: mainMenu() },
  );
}

export function registerCommands(bot) {
  bot.api
    .setMyCommands([
      { command: "start", description: "Bosh menyu" },
      { command: "player", description: "O'yinchi tahlili: /player #TAG" },
      { command: "clan", description: "Klan tahlili: /clan #TAG" },
      { command: "plans", description: "Planlar" },
      { command: "help", description: "Yordam" },
    ])
    .catch(() => {});

  bot.command("start", (ctx) => showMenu(ctx));

  bot.command("help", (ctx) =>
    ctx.reply(HELP_TEXT, { reply_markup: helpKeyboard() }),
  );

  bot.command("plans", (ctx) =>
    ctx.reply(PLANS_TEXT, { reply_markup: homeBtn() }),
  );

  bot.command("ping", (ctx) => ctx.reply("✅ ClashPulse ishlayapti!"));

  bot.command("ip", async (ctx) => {
    const r = await fetch("https://api.ipify.org");
    ctx.reply("IP: " + (await r.text()));
  });

  bot.command("player", async (ctx) => {
    const tag = cleanTag(ctx.match);
    if (!tag) {
      waiting.set(cid(ctx), "player");
      return ctx.reply("👤 O'yinchi tegini yuboring.\nMasalan: #ABC123");
    }
    return sendPlayer(ctx, tag);
  });

  bot.command("clan", async (ctx) => {
    const tag = cleanTag(ctx.match);
    if (!tag) {
      waiting.set(cid(ctx), "clan");
      return ctx.reply("🛡 Klan tegini yuboring.\nMasalan: #ABC123");
    }
    return sendClan(ctx, tag);
  });

  bot.callbackQuery("menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    return showMenu(ctx);
  });

  bot.callbackQuery("player", async (ctx) => {
    await ctx.answerCallbackQuery();
    waiting.set(cid(ctx), "player");
    return ctx.reply(
      "👤 O'yinchi tahlili\n\nO'yinchi tegini yuboring.\nMasalan: #ABC123\n\nBekor qilish: /start",
    );
  });

  bot.callbackQuery("clan", async (ctx) => {
    await ctx.answerCallbackQuery();
    waiting.set(cid(ctx), "clan");
    return ctx.reply(
      "🛡 Klan tahlili\n\nKlan tegini yuboring.\nMasalan: #ABC123\n\nBekor qilish: /start",
    );
  });

  bot.callbackQuery("plans", async (ctx) => {
    await ctx.answerCallbackQuery();
    return ctx.reply(PLANS_TEXT, { reply_markup: homeBtn() });
  });

  bot.callbackQuery("help", async (ctx) => {
    await ctx.answerCallbackQuery();
    return ctx.reply(HELP_TEXT, { reply_markup: helpKeyboard() });
  });

  bot.callbackQuery(/^t:([pc]):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const kind = ctx.match[1];
    const tag = ctx.match[2];
    return kind === "p" ? sendPlayer(ctx, tag) : sendClan(ctx, tag);
  });

  // Oddiy matn: tugmadan keyin yuborilgan teg
  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return next();

    const tag = cleanTag(text);
    const mode = waiting.get(cid(ctx));

    if (mode) {
      if (!tag)
        return ctx.reply(
          "❌ Teg noto'g'ri. Masalan: #ABC123\n\nBosh menyuga qaytish: /start",
        );
      return mode === "player" ? sendPlayer(ctx, tag) : sendClan(ctx, tag);
    }

    if (tag) {
      const kb = new InlineKeyboard()
        .text("👤 O'yinchi", "t:p:" + tag)
        .text("🛡 Klan", "t:c:" + tag);
      return ctx.reply("Bu teg kimniki?\n" + tag, { reply_markup: kb });
    }

    return ctx.reply("Menyu uchun /start ni bosing.");
  });
}
