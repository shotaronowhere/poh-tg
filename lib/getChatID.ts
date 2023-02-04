import TelegramBot from "node-telegram-bot-api";
require('dotenv').config()
const Bot = require('node-telegram-bot-api');
const bot: TelegramBot = new Bot(process.env.BOT_TOKEN, {polling: true, testEnvironment: false});

bot.on("my_chat_member", async function(myChatMember: TelegramBot.ChatMemberUpdated) {
    console.log(myChatMember.chat.id)
})

console.log('Add your bot to a group/chat/channel to print the id in the console. . .')