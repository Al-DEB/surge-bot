const TelegramBot = require("node-telegram-bot-api");
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
bot.sendMessage(process.env.CHAT_ID, "Test bot working");
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Hello from test bot");
});
console.log("Bot started");
