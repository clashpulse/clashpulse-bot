import fs from "node:fs";
import path from "node:path";
import { InlineKeyboard } from "grammy";

const API = "https://api.clashofclans.com/v1";
const CONTACT = "hojam";
const BOT_USERNAME = "clashpulsebot";
const ADMIN_ID = String(process.env.ADMIN_ID || "");

// ---------- Statistika (faylga saqlanadi) ----------
// FadeHost'da DATA_DIR ni persistent volume ichiga yo'naltiring (masalan /app/data)
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const STATS_FILE = path.join(DATA_DIR, "stats.json");
const MAX_TAGS = 200; // stats.tags cheksiz o'smasin
const MAX_USERS_KEEP_DAYS = 180; // eski foydalanuvchilarni tozalash

let stats = { users: {}, chats: {}, features: {}, tags: {} };
let dirty = false;

try {
  const raw = fs.readFileSync(STATS_FILE, "utf8");
  const parsed = JSON.parse(raw);
  stats = {
    users: parsed.users || {},
    chats: parsed.chats || {},
    features: parsed.features || {},
    tags: parsed.tags || {},
  };
} catch (e) {
  if (e.code !== "ENOENT") console.error("stats.json o'qishda xato:", e.message);
}

function pruneStats() {
  const now = Date.now();
  const cutoff = now - MAX_USERS_KEEP_DAYS * 86400000;
  // eski foydalanuvchilarni o'chirish
  for (const id of Object.keys(stats.users)) {
    if ((stats.users[id].l || 0) < cutoff) delete stats.users[id];
  }
  // taglarni top MAX_TAGS bo'yicha kesish
  const entries = Object.entries(stats.tags).sort((a, b) => b[1].c - a[1].c);
  if (entries.length > MAX_TAGS) {
    stats.tags = Object.fromEntries(entries.slice(0, MAX_TAGS));
  }
  dirty = true;
}

function saveStats() {
  if (!dirty) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = STATS_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(stats));
    fs.renameSync(tmp, STATS_FILE); // atomik yozish
    dirty = false;
  } catch (e) {
    console.error("stats.json yozishda xato:", e.message);
  }
}

const saveTimer = setInterval(saveStats, 30000);
if (saveTimer.unref) saveTimer.unref();

const pruneTimer = setInterval(pruneStats, 6 * 3600 * 1000);
if (pruneTimer.unref) pruneTimer.unref();

function shutdown() {
  try {
    dirty = true;
    saveStats();
  } catch (e) {
    console.error("shutdown save xato:", e.message);
  }
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("beforeExit", saveStats);

function feat(kind) {
  stats.features[kind] = (stats.features[kind] || 0) + 1;
  dirty = true;
}

function viewed(kind, tag, name, key) {
  feat(key || kind);
  const t = stats.tags[tag] || (stats.tags[tag] = { k: kind, n: name, c: 0 });
  t.n = name;
  t.c++;
  dirty = true;
}

function track(ctx) {
  const u = ctx.from;
  if (!u || u.is_bot) return;
  const ch = ctx.chat;
  const isGroup = ch && ch.type !== "private";
  const isCmd = ctx.message?.text?.startsWith("/");
  if (isGroup && !isCmd && !ctx.callbackQuery) return;
  const now = Date.now();
  const rec = stats.users[u.id] || (stats.users[u.id] = { f: now, c: 0 });
  rec.n = [u.first_name, u.last_name].filter(Boolean).join(" ");
  rec.u = u.username || "";
  rec.l = now;
  if (ctx.message || ctx.callbackQuery) rec.c++;
  if (isGroup) stats.chats[ch.id] = { t: ch.title || "", k: ch.type, l: now };
  dirty = true;
}

const FEATURE_NAMES = {
  player: "O'yinchi tahlili",
  clan: "Klan tahlili",
  inline: "Inline qidiruv",
  help: "Yordam",
  plans: "Planlar",
  start: "/start",
};

const num = (x) => Number(x || 0).toLocaleString("en-US");

function statsText() {
  const now = Date.now();
  const users = Object.values(stats.users);
  const day = users.filter((u) => now - u.l < 86400000).length;
  const week = users.filter((u) => now - u.l < 7 * 86400000).length;
  const fresh = users.filter((u) => now - u.f < 86400000).length;
  const chats = Object.values(stats.chats);

  const top = [...users]
    .sort((a, b) => b.c - a.c)
    .slice(0, 5)
    .map(
      (u, i) =>
        i + 1 + ". " + (u.n || "?") + (u.u ? " (@" + u.u + ")" : "") + " - " + num(u.c) + " ta amal",
    )
    .join("\n");

  const feats = Object.entries(stats.features)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => "• " + (FEATURE_NAMES[k] || k) + ": " + num(v))
    .join("\n");

  const tags = Object.entries(stats.tags)
    .sort((a, b) => b[1].c - a[1].c)
    .slice(0, 5)
    .map(
      ([t, v], i) =>
        i + 1 + ". " + (v.k === "clan" ? "🛡 " : "👤 ") + (v.n || t) + " (" + t + ") - " + v.c + " marta",
    )
    .join("\n");

  const groups = chats
    .slice(0, 5)
    .map((c) => "• " + (c.t || "nomsiz"))
    .join("\n");

  return [
    "📊 ClashPulse statistikasi",
    "",
    "👥 Jami foydalanuvchi: " + num(users.length),
    "🆕 Oxirgi 24 soatda yangi: " + num(fresh),
    "🔥 Oxirgi 24 soatda faol: " + num(day),
    "📅 Oxirgi 7 kunda faol: " + num(week),
    "💬 Guruhlar: " + num(chats.length),
    groups ? groups : null,
    "",
    "🧩 Funksiyalar bo'yicha:",
    feats || "hali yo'q",
    "",
    "🥇 Eng faol foydalanuvchilar:",
    top || "hali yo'q",
    "",
    "🔎 Eng ko'p qidirilgan:",
    tags || "hali yo'q",
  ]
    .filter((x) => x !== null)
    .join("\n");
}

// ---------- Clash of Clans API ----------
const waiting = new Map();
const cid = (ctx) => ctx.chat?.id ?? ctx.from?.id;
const isPrivate = (ctx) => ctx.chat?.type === "private";
const isAdmin = (ctx) => ADMIN_ID !== "" && String(ctx.from?.id) === ADMIN_ID;

// Oddiy TTL kesh (inline uchun API yuklamasini kamaytiradi)
const apiCache = new Map(); // key -> { t, val }
const CACHE_TTL = 60_000;
function cacheGet(key) {
  const e = apiCache.get(key);
  if (!e) return null;
  if (Date.now() - e.t > CACHE_TTL) {
    apiCache.delete(key);
    return null;
  }
  return e.val;
}
function cacheSet(key, val) {
  apiCache.set(key, { t: Date.now(), val });
  if (apiCache.size > 500) {
    // eng eski 100 tasini tozalash
    const it = apiCache.keys();
    for (let i = 0; i < 100; i++) {
      const k = it.next().value;
      if (k === undefined) break;
      apiCache.delete(k);
    }
  }
}

async function coc(path) {
  const token = process.env.COC_API_TOKEN;
  if (!token) return { error: "COC_API_TOKEN topilmadi." };

  const cached = cacheGet(path);
  if (cached) return cached;

  let result;
  try {
    const res = await fetch(API + path, {
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) result = { error: "Topilmadi. Tegni tekshiring." };
    else if (res.status === 403)
      result = { error: "API ruxsat bermadi (403). IP yoki kalitni tekshiring." };
    else if (res.status === 429)
      result = { error: "So'rovlar ko'p. Birozdan keyin urinib ko'ring." };
    else if (!res.ok) result = { error: "API xatosi: " + res.status };
    else result = { data: await res.json() };
  } catch (e) {
    if (e.name === "TimeoutError")
      result = { error: "API javob bermadi. Keyinroq urinib ko'ring." };
    else result = { error: "Ulanishda xato. Keyinroq urinib ko'ring." };
  }
  // xatolarni keshlash mantiqsiz
  if (result.data) cacheSet(path, result);
  return result;
}

function cleanTag(text) {
  const t = (text || "").trim().toUpperCase().replace(/^#/, "").replace(/O/g, "0");
  if (!/^[0289PYLQGRJCUV]{3,12}$/.test(t)) return null;
  return "#" + t;
}

const bar = (p) => {
  const f = Math.max(0, Math.min(10, Math.round(p / 10)));
  return "█".repeat(f) + "░".repeat(10 - f);
};

function progressOf(list) {
  const mx = list.reduce((s, x) => s + (x.maxLevel || 0), 0);
  const lv = list.reduce((s, x) => s + Math.min(x.level || 0, x.maxLevel || 0), 0);
  return mx ? Math.round((lv / mx) * 100) : null;
}

function progressLine(label, list) {
  const p = progressOf(list);
  return p === null ? null : label + ": " + bar(p) + " " + p + "%";
}

function chartUrl(title, labels, values, color) {
  const cfg = {
    type: "horizontalBar",
    data: {
      labels: labels.map((l) => String(l).slice(0, 14)),
      datasets: [{ data: values, backgroundColor: color }],
    },
    options: {
      legend: { display: false },
      title: { display: true, text: title },
    },
  };
  return (
    "https://quickchart.io/chart?width=700&height=420&backgroundColor=white&c=" +
    encodeURIComponent(JSON.stringify(cfg))
  );
}

// Inline uchun qisqa matnlar
function playerSummary(p) {
  const heroes = (p.heroes || []).filter((h) => h.village === "home");
  const hp = progressOf(heroes);
  return [
    "👤 " + p.name + " (" + p.tag + ")",
    "🏰 Town Hall: " + p.townHallLevel + " | ⭐ Daraja: " + p.expLevel,
    "🏆 Kubok: " + num(p.trophies) + " (eng yuqori " + num(p.bestTrophies) + ")",
    "⚔️ Urush yulduzlari: " + num(p.warStars),
    "🤝 Donat: " + num(p.donations) + " / " + num(p.donationsReceived),
    "🏷 Klan: " + (p.clan ? p.clan.name : "klanda emas"),
    hp !== null ? "🦸 Qahramonlar: " + bar(hp) + " " + hp + "%" : null,
    "",
    "To'liq tahlil: @" + BOT_USERNAME,
  ]
    .filter((x) => x !== null)
    .join("\n");
}

function clanSummary(c) {
  const leader = (c.memberList || []).find((m) => m.role === "leader");
  return [
    "🛡 " + c.name + " (" + c.tag + ")",
    "📈 Daraja: " + c.clanLevel + " | 👥 A'zolar: " + c.members + "/50",
    leader ? "👑 Lider: " + leader.name : null,
    "🏆 Klan ballari: " + num(c.clanPoints),
    "⚔️ Urush g'alabalari: " + num(c.warWins) + " | 🔥 Seriya: " + num(c.warWinStreak),
    c.warLeague ? "🏅 Urush ligasi: " + c.warLeague.name : null,
    "🔓 Turi: " + c.type,
    "",
    "To'liq tahlil: @" + BOT_USERNAME,
  ]
    .filter((x) => x !== null)
    .join("\n");
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
    "🏆 Kubok: " + num(p.trophies) + " (eng yuqori: " + num(p.bestTrophies) + ")",
    "⚔️ Urush yulduzlari: " + num(p.warStars),
    "🗡 Hujum g'alabalari: " + num(p.attackWins),
    "🛡 Mudofaa g'alabalari: " + num(p.defenseWins),
    "🤝 Donat: berilgan " + num(p.donations) + ", olingan " + num(p.donationsReceived) + " (nisbat " + ratio + ")",
    "🏛 Capital hissasi: " + num(p.clanCapitalContributions),
    p.builderHallLevel
      ? "🏗 Builder Base: BH " + p.builderHallLevel + ", kubok " + num(p.builderBaseTrophies) + " (eng yuqori " + num(p.bestBuilderBaseTrophies) + ")"
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
    .map((a) => "• " + a.name + ": " + num(a.value))
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
  return { parts, clanTag: p.clan ? p.clan.tag : null, name: p.name };
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

  const games = (c.warWins || 0) + (c.warLosses || 0) + (c.warTies || 0);
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
    "🏆 Klan ballari: " + num(c.clanPoints),
    c.requiredTrophies ? "🎯 Talab: " + num(c.requiredTrophies) + " kubok" : null,
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
    "G'alaba: " + num(c.warWins) + (c.isWarLogPublic ? ", durang: " + num(c.warTies) + ", mag'lubiyat: " + num(c.warLosses) : ""),
    "G'alaba foizi: " + winRate,
    "🔥 G'alaba seriyasi: " + num(c.warWinStreak),
    "Urush chastotasi: " + (c.warFrequency || "noma'lum"),
    "",
    "📊 A'zolar tahlili",
    "",
    "O'rtacha kubok: " + num(avgTr),
    "Jami donat: " + num(totalDon) + " (olingan " + num(totalRec) + ")",
    "O'rtacha donat: " + num(avgDon),
    "Faol (donat bergan): " + activePct + "% (" + inactive + " ta passiv)",
    "Rollar: lider " + (roles.leader || 0) + ", katta " + (roles.coLeader || 0) + ", oqsoqol " + (roles.admin || 0) + ", a'zo " + (roles.member || 0),
  ].join("\n");

  const byTr = [...members].sort((a, b) => b.trophies - a.trophies).slice(0, 10);
  const byDon = [...members].sort((a, b) => b.donations - a.donations).slice(0, 10);

  const top10 = byTr
    .map((m, i) => i + 1 + ". " + m.name + " - " + num(m.trophies))
    .join("\n");

  const topDon = byDon
    .slice(0, 5)
    .map((m, i) => i + 1 + ". " + m.name + " - " + num(m.donations))
    .join("\n");

  const takers = members
    .filter((m) => m.donationsReceived > m.donations)
    .sort(
      (a, b) =>
        b.donationsReceived - b.donations - (a.donationsReceived - a.donations),
    )
    .slice(0, 3)
    .map((m) => "• " + m.name + ": berdi " + num(m.donations) + ", oldi " + num(m.donationsReceived))
    .join("\n");

  // Joriy urush (faqat mantiqiy holatlarda)
  let warText = "";
  const w = await coc("/clans/" + encodeURIComponent(tag) + "/currentwar");
  if (w.data && ["preparation", "inWar"].includes(w.data.state)) {
    const st = w.data.state === "preparation" ? "tayyorgarlik" : "urush ketmoqda";
    warText =
      "\n\n⚔️ Joriy urush: " + st + "\n" +
      w.data.clan.name + " " + (w.data.clan.stars || 0) + "⭐ " + Number(w.data.clan.destructionPercentage || 0).toFixed(1) + "%\n" +
      "vs " + w.data.opponent.name + " " + (w.data.opponent.stars || 0) + "⭐ " + Number(w.data.opponent.destructionPercentage || 0).toFixed(1) + "%";
  }

  const part3 =
    "🥇 Top 10 (kubok bo'yicha):\n" + top10 +
    "\n\n🤝 Top 5 donat beruvchi:\n" + topDon +
    (takers ? "\n\n📥 Berganidan ko'p olganlar:\n" + takers : "") +
    warText;

  const charts = [];
  if (byTr.length)
    charts.push(
      chartUrl(c.name + " - Top 10 kubok", byTr.map((m) => m.name), byTr.map((m) => m.trophies), "#5b6ee1"),
    );
  if (totalDon > 0)
    charts.push(
      chartUrl(c.name + " - Top 10 donat", byDon.map((m) => m.name), byDon.map((m) => m.donations), "#2eb872"),
    );

  return {
    parts: [part1, part2, part3],
    name: c.name,
    badge: c.badgeUrls ? c.badgeUrls.large || c.badgeUrls.medium : null,
    charts,
  };
}

// ---------- Tugmalar va matnlar ----------
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

function playerOrClanKb(tag) {
  return new InlineKeyboard()
    .text("👤 O'yinchi", "t:p:" + tag)
    .text("🛡 Klan", "t:c:" + tag);
}

const HELP_TEXT =
  "ℹ️ Yordam\n\n" +
  "ClashPulse - Clash of Clans o'yinchilari va klanlari uchun tahlil boti.\n\n" +
  "Qanday ishlatiladi:\n" +
  "1. \"O'yinchi tahlili\" yoki \"Klan tahlili\" tugmasini bosing\n" +
  "2. Tegni yuboring, masalan: #ABC123\n\n" +
  "Tegni topish: o'yinda profilingizni oching, teg ismingiz ostida yoziladi.\n\n" +
  "Guruhda: /player #TAG yoki /clan #TAG\n" +
  "Istalgan chatda: @" + BOT_USERNAME + " #TAG yozing, o'yinchi yoki klan ma'lumoti chiqadi.\n\n" +
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
    await ctx.reply(parts[i], last && keyboard ? { reply_markup: keyboard } : undefined);
  }
}

async function sendPlayer(ctx, tag) {
  try {
    await ctx.replyWithChatAction("typing").catch(() => {});
    const r = await playerReport(tag);
    if (r.error) return ctx.reply("❌ " + r.error, { reply_markup: homeBtn() });
    viewed("player", tag, r.name);
    const kb = new InlineKeyboard();
    if (r.clanTag) kb.text("🛡 Klanni tahlil qilish", "t:c:" + r.clanTag).row();
    kb.text("🏠 Bosh menyu", "menu");
    return sendParts(ctx, r.parts, kb);
  } catch (e) {
    console.error("sendPlayer:", e.message);
    return ctx.reply("❌ Kutilmagan xato. Keyinroq urinib ko'ring.");
  }
}

async function sendClan(ctx, tag) {
  try {
    await ctx.replyWithChatAction("typing").catch(() => {});
    const r = await clanReport(tag);
    if (r.error) return ctx.reply("❌ " + r.error, { reply_markup: homeBtn() });
    viewed("clan", tag, r.name);
    const [p1, p2, p3] = r.parts;

    let sent = false;
    if (r.badge) {
      try {
        await ctx.replyWithPhoto(r.badge, { caption: p1.slice(0, 1000) });
        sent = true;
      } catch (e) {
        console.error("badge yuborishda xato:", e.message);
      }
    }
    if (!sent) await ctx.reply(p1);

    await ctx.reply(p2);

    for (const url of r.charts) {
      try {
        await ctx.replyWithPhoto(url);
      } catch (e) {
        console.error("chart yuborishda xato:", e.message);
      }
    }

    return ctx.reply(p3, { reply_markup: homeBtn() });
  } catch (e) {
    console.error("sendClan:", e.message);
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

// ---------- Asosiy ----------
export function registerCommands(bot) {
  // Global xato ushlagich — bitta handler yiqilsa polling to'xtamaydi
  bot.catch((err) => {
    console.error("Bot handler xatosi:", err?.message || err);
  });

  bot.api
    .setMyCommands([
      { command: "start", description: "Bosh menyu" },
      { command: "player", description: "O'yinchi tahlili: /player #TAG" },
      { command: "clan", description: "Klan tahlili: /clan #TAG" },
      { command: "plans", description: "Planlar" },
      { command: "help", description: "Yordam" },
      { command: "ping", description: "Bot holati" },
    ])
    .catch((e) => console.error("setMyCommands:", e.message));

  bot.use(async (ctx, next) => {
    try {
      track(ctx);
    } catch (e) {
      console.error("track:", e.message);
    }
    return next();
  });

  bot.command("start", (ctx) => {
    feat("start");
    return showMenu(ctx);
  });

  bot.command("help", (ctx) => {
    feat("help");
    return ctx.reply(HELP_TEXT, { reply_markup: helpKeyboard() });
  });

  bot.command("plans", (ctx) => {
    feat("plans");
    return ctx.reply(PLANS_TEXT, { reply_markup: homeBtn() });
  });

  bot.command("ping", (ctx) => ctx.reply("✅ ClashPulse ishlayapti!"));

  bot.command("id", (ctx) => ctx.reply("Sizning ID: " + ctx.from.id));

  bot.command("ip", async (ctx) => {
    if (!isAdmin(ctx)) return;
    try {
      const r = await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(8000) });
      return ctx.reply("IP: " + (await r.text()));
    } catch (e) {
      return ctx.reply("IP olishda xato: " + e.message);
    }
  });

  bot.command("stats", (ctx) => {
    if (ADMIN_ID === "")
      return ctx.reply(
        "ADMIN_ID sozlanmagan. Sizning ID: " + ctx.from.id +
          "\n\nFadeHost'da ADMIN_ID o'zgaruvchisiga shu raqamni yozing.",
      );
    if (!isAdmin(ctx)) return;
    saveStats();
    return ctx.reply(statsText());
  });

  bot.command("player", async (ctx) => {
    const tag = cleanTag(ctx.match);
    if (!tag) {
      if (isPrivate(ctx)) {
        waiting.set(cid(ctx), "player");
        return ctx.reply("👤 O'yinchi tegini yuboring.\nMasalan: #ABC123");
      }
      return ctx.reply("Tegni shunday yozing:\n/player #ABC123");
    }
    return sendPlayer(ctx, tag);
  });

  bot.command("clan", async (ctx) => {
    const tag = cleanTag(ctx.match);
    if (!tag) {
      if (isPrivate(ctx)) {
        waiting.set(cid(ctx), "clan");
        return ctx.reply("🛡 Klan tegini yuboring.\nMasalan: #ABC123");
      }
      return ctx.reply("Tegni shunday yozing:\n/clan #ABC123");
    }
    return sendClan(ctx, tag);
  });

  bot.callbackQuery("menu", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    return showMenu(ctx);
  });

  bot.callbackQuery("player", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    if (!isPrivate(ctx))
      return ctx.reply("Guruhda buyruqdan foydalaning:\n/player #ABC123");
    waiting.set(cid(ctx), "player");
    return ctx.reply(
      "👤 O'yinchi tahlili\n\nO'yinchi tegini yuboring.\nMasalan: #ABC123\n\nBekor qilish: /start",
    );
  });

  bot.callbackQuery("clan", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    if (!isPrivate(ctx))
      return ctx.reply("Guruhda buyruqdan foydalaning:\n/clan #ABC123");
    waiting.set(cid(ctx), "clan");
    return ctx.reply(
      "🛡 Klan tahlili\n\nKlan tegini yuboring.\nMasalan: #ABC123\n\nBekor qilish: /start",
    );
  });

  bot.callbackQuery("plans", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    feat("plans");
    return ctx.reply(PLANS_TEXT, { reply_markup: homeBtn() });
  });

  bot.callbackQuery("help", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    feat("help");
    return ctx.reply(HELP_TEXT, { reply_markup: helpKeyboard() });
  });

  bot.callbackQuery(/^t:([pc]):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const kind = ctx.match[1];
    const tag = ctx.match[2];
    return kind === "p" ? sendPlayer(ctx, tag) : sendClan(ctx, tag);
  });

  // Inline rejim: istalgan chatda @clashpulsebot #TAG
  bot.on("inline_query", async (ctx) => {
    try {
      const tag = cleanTag(ctx.inlineQuery.query);
      if (!tag) {
        return await ctx.answerInlineQuery(
          [
            {
              type: "article",
              id: "hint",
              title: "Tegni yozing",
              description: "Masalan: #ABC123 (o'yinchi yoki klan)",
              input_message_content: {
                message_text:
                  "ClashPulse: @" + BOT_USERNAME + " #TAG yozib o'yinchi yoki klan ma'lumotini oling.",
              },
            },
          ],
          { cache_time: 5 },
        );
      }

      // API yuklamasini kamaytirish: avval player, bo'lmasa clan
      // (har bir inline so'rov uchun 1-2 chaqiruv, parallel 2 ta emas)
      feat("inline");
      const results = [];

      const pl = await coc("/players/" + encodeURIComponent(tag));
      if (pl.data) {
        const p = pl.data;
        viewed("player", tag, p.name, "inline");
        results.push({
          type: "article",
          id: "p:" + tag,
          title: ("👤 " + p.name).slice(0, 90),
          description:
            ("TH " + p.townHallLevel + " • " + num(p.trophies) + " kubok" +
              (p.clan ? " • " + p.clan.name : "")).slice(0, 120),
          thumbnail_url: p.league?.iconUrls?.small,
          input_message_content: { message_text: playerSummary(p) },
        });
      } else {
        const cl = await coc("/clans/" + encodeURIComponent(tag));
        if (cl.data) {
          const c = cl.data;
          viewed("clan", tag, c.name, "inline");
          results.push({
            type: "article",
            id: "c:" + tag,
            title: ("🛡 " + c.name).slice(0, 90),
            description:
              ("Daraja " + c.clanLevel + " • " + c.members + "/50 a'zo • " + num(c.clanPoints) + " ball").slice(0, 120),
            thumbnail_url: c.badgeUrls?.small,
            input_message_content: { message_text: clanSummary(c) },
          });
        }
      }

      if (!results.length) {
        results.push({
          type: "article",
          id: "none",
          title: "❌ Bu teg bo'yicha hech narsa topilmadi",
          description: "Tegni tekshiring (masalan #ABC123)",
          input_message_content: { message_text: "❌ Bu teg bo'yicha hech narsa topilmadi." },
        });
      }
      return await ctx.answerInlineQuery(results, { cache_time: 30 });
    } catch (e) {
      console.error("inline_query:", e.message);
    }
  });

  // Oddiy matn: faqat shaxsiy chatda
  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return next();
    if (!isPrivate(ctx)) return next();

    const tag = cleanTag(text);
    const mode = waiting.get(cid(ctx));

    if (mode) {
      if (!tag)
        return ctx.reply("❌ Teg noto'g'ri. Masalan: #ABC123\n\nBosh menyuga qaytish: /start");
      return mode === "player" ? sendPlayer(ctx, tag) : sendClan(ctx, tag);
    }

    if (tag) {
      return ctx.reply("Bu teg kimniki?\n" + tag, { reply_markup: playerOrClanKb(tag) });
    }

    return ctx.reply("Menyu uchun /start ni bosing.");
  });
}
