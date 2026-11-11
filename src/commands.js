import { InlineKeyboard } from "grammy";

const API = "https://api.clashofclans.com/v1";

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

export function registerCommands(bot) {
  const menu = new InlineKeyboard()
    .text("👤 O'yinchi tahlili", "player")
    .text("🛡 Klan tahlili", "clan")
    .row()
    .text("ℹ️ Yordam", "help");

  bot.command("start", (ctx) =>
    ctx.reply(
      "Salom, " + (ctx.from?.first_name ?? "do'st") + "!\n\n" +
        "Men ClashPulse botman. Clash of Clans o'yinchi va klanlarini tahlil qilaman.\n\n" +
        "Kerakli bo'limni tanlang:",
      { reply_markup: menu },
    ),
  );

  bot.command("help", (ctx) =>
    ctx.reply(
      "ClashPulse komandalar:\n\n" +
        "/start - Bosh menyu\n" +
        "/player #TAG - O'yinchi tahlili\n" +
        "/clan #TAG - Klan tahlili\n" +
        "/ping - Bot holatini tekshirish",
    ),
  );

  bot.command("ping", (ctx) => ctx.reply("✅ ClashPulse ishlayapti!"));

  bot.command("ip", async (ctx) => {
    const r = await fetch("https://api.ipify.org");
    ctx.reply("IP: " + (await r.text()));
  });

  bot.command("player", async (ctx) => {
    const tag = cleanTag(ctx.match);
    if (!tag) return ctx.reply("Tegni shunday yozing:\n/player #ABC123");
    const { data: p, error } = await coc("/players/" + encodeURIComponent(tag));
    if (error) return ctx.reply("❌ " + error);

    const heroes = (p.heroes || []).filter((h) => h.village === "home");
    const lv = heroes.reduce((s, h) => s + h.level, 0);
    const mx = heroes.reduce((s, h) => s + h.maxLevel, 0);
    const heroPct = mx ? Math.round((lv / mx) * 100) : 0;
    const heroLines = heroes.map((h) => "• " + h.name + ": " + h.level + "/" + h.maxLevel).join("\n");
    const ratio = p.donationsReceived
      ? (p.donations / p.donationsReceived).toFixed(2)
      : String(p.donations || 0);

    ctx.reply(
      "👤 " + p.name + " (" + p.tag + ")\n\n" +
        "🏰 Town Hall: " + p.townHallLevel + "\n" +
        "⭐ Daraja: " + p.expLevel + "\n" +
        "🏆 Kubok: " + n(p.trophies) + " (eng yuqori: " + n(p.bestTrophies) + ")\n" +
        "⚔️ Urush yulduzlari: " + n(p.warStars) + "\n" +
        "🗡 Hujum g'alabalari: " + n(p.attackWins) + "\n" +
        "🛡 Mudofaa g'alabalari: " + n(p.defenseWins) + "\n" +
        "🤝 Donat: berilgan " + n(p.donations) + ", olingan " + n(p.donationsReceived) + " (nisbat " + ratio + ")\n" +
        "🏷 Klan: " + (p.clan ? p.clan.name + " (" + p.role + ")" : "klanda emas") + "\n\n" +
        (heroes.length
          ? "🦸 Qahramonlar (" + heroPct + "% maksimumdan):\n" + heroLines
          : "🦸 Qahramonlar yo'q"),
    );
  });

  bot.command("clan", async (ctx) => {
    const tag = cleanTag(ctx.match);
    if (!tag) return ctx.reply("Tegni shunday yozing:\n/clan #ABC123");
    const { data: c, error } = await coc("/clans/" + encodeURIComponent(tag));
    if (error) return ctx.reply("❌ " + error);

    const members = c.memberList || [];
    const totalDon = members.reduce((s, m) => s + (m.donations || 0), 0);
    const avgDon = members.length ? Math.round(totalDon / members.length) : 0;
    const top = [...members]
      .sort((a, b) => b.trophies - a.
        trophies)
      .slice(0, 5)
      .map((m, i) => (i + 1) + ". " + m.name + " - " + n(m.trophies))
      .join("\n");

    ctx.reply(
      "🛡 " + c.name + " (" + c.tag + ")\n\n" +
        "📈 Daraja: " + c.clanLevel + "\n" +
        "👥 A'zolar: " + c.members + "/50\n" +
        "🏆 Klan ballari: " + n(c.clanPoints) + "\n" +
        "⚔️ Urush g'alabalari: " + n(c.warWins) + "\n" +
        "🔥 G'alaba seriyasi: " + n(c.warWinStreak) + "\n" +
        "🤝 O'rtacha donat: " + n(avgDon) + "\n\n" +
        "🥇 Top 5 o'yinchi:\n" + top,
    );
  });

  bot.callbackQuery("player", (ctx) =>
    ctx.answerCallbackQuery().then(() =>
      ctx.reply("👤 O'yinchi tahlili\n\nTegni shunday yuboring:\n/player #ABC123"),
    ),
  );

  bot.callbackQuery("clan", (ctx) =>
    ctx.answerCallbackQuery().then(() =>
      ctx.reply("🛡 Klan tahlili\n\nTegni shunday yuboring:\n/clan #ABC123"),
    ),
  );

  bot.callbackQuery("help", (ctx) =>
    ctx.answerCallbackQuery().then(() =>
      ctx.reply("ClashPulse - Clash of Clans o'yinchilari va klanlari uchun tahlil boti.\n\nKomandalar: /player #TAG, /clan #TAG"),
    ),
  );
}
