import { InlineKeyboard } from "grammy"

export function registerCommands(bot) {
  const menu = new InlineKeyboard()
    .text("👤 O‘yinchi tahlili", "player")
    .row()
    .text("🛡 Klan tahlili", "clan")
    .row()
    .text("📊 Yordam", "help")

  bot.command("start", (ctx) =>
    ctx.reply(
      `Assalomu alaykum, ${ctx.from?.first_name ?? "o‘yinchi"}!

Men ClashPulse botman.

Clash of Clans akkauntingiz va klaningiz haqida ma’lumot olishga yordam beraman.

Kerakli bo‘limni tanlang:`,
      { reply_markup: menu },
    ),
  )

  bot.command("help", (ctx) =>
    ctx.reply(
      "ClashPulse komandalar:\n\n/start — Bosh menyu\n/help — Yordam\n/ping — Bot holatini tekshirish",
    ),
  )

  bot.command("ping", (ctx) => ctx.reply("✅ ClashPulse ishlayapti!"))

  bot.callbackQuery("player", (ctx) =>
    ctx.answerCallbackQuery().then(() =>
      ctx.reply("👤 O‘yinchi tahlili\n\nBu bo‘limga keyingi bosqichda Player Tag kiritish imkoniyatini qo‘shamiz."),
    ),
  )

  bot.callbackQuery("clan", (ctx) =>
    ctx.answerCallbackQuery().then(() =>
      ctx.reply("🛡 Klan tahlili\n\nBu bo‘limga keyingi bosqichda Clan Tag kiritish imkoniyatini qo‘shamiz."),
    ),
  )

  bot.callbackQuery("help", (ctx) =>
    ctx.answerCallbackQuery().then(() =>
      ctx.reply("ClashPulse — Clash of Clans o‘yinchilari va klanlari uchun tahlil boti."),
    ),
  )
}
