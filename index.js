const TelegramBot = require('node-telegram-bot-api');
const { Client, LocalAuth } = require('whatsapp-web.js');
const readline = require('readline');

const bot = new TelegramBot('8756894553:AAFWWIV6ZhlXj1WBQsIjOPVg7O-Cpt2JA1U', { polling: true });
const waClient = new Client({ 
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    } 
});
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const startTime = Math.floor(Date.now() / 1000);
const cooldowns = new Set();
const adj = ["Cyber", "Neon", "Phantom", "Mystic", "Cosmic", "Quantum", "Alpha", "Shadow", "Void", "Titan"];
const nsn = ["Syndicate", "Nexus", "Vanguard", "Horizon", "Matrix", "Outpost", "Legion", "Network", "Core", "Node"];

rl.question('\n┌────────────────────────\n│ TARGET NUMBER : ', async (num) => {
    const clean = num.replace(/[^0-9]/g, '');
    waClient.initialize();
    waClient.on('qr', async () => {
        try {
            const code = await waClient.requestPairingCode(clean);
            console.log(`\n┌────────────────────────\n│ PAIRING CODE : ${code}\n└────────────────────────\n`);
        } catch (e) {
            console.log(`│ ERROR : ${e.message}`);
        }
    });
});

waClient.on('ready', () => console.log('│ SYSTEM : WA CONNECTED\n└────────────────────────'));

bot.onText(/\/start/, (msg) => {
    if (msg.date < startTime) return;
    bot.sendMessage(msg.chat.id, `\`\`\`\n┌────────────────────────\n│ ＮＥＸＵＳ_ＳＹＳＴＥＭ\n├────────────────────────\n│ STATUS : ONLINE\n│ LOCK   : ADMIN ONLY\n│ DELAY  : 60 SECONDS\n│ \n│ CMD    : /buatgrup [no]\n└────────────────────────\`\`\``, { parse_mode: 'Markdown' });
});

bot.onText(/\/buatgrup (.+)/, async (msg, match) => {
    if (msg.date < startTime) return;
    const cid = msg.chat.id;

    if (cooldowns.has(cid)) {
        return bot.sendMessage(cid, "`│ SYSTEM : COOLDOWN ACTIVE`", { parse_mode: 'Markdown' });
    }

    const target = match[1].replace(/[^0-9]/g, '');
    if (!waClient.info || !target.startsWith('62')) {
        return bot.sendMessage(cid, "`│ SYSTEM : WA NOT READY / INVALID NO`", { parse_mode: 'Markdown' });
    }

    const name = `${adj[Math.floor(Math.random() * adj.length)]} ${nsn[Math.floor(Math.random() * nsn.length)]} ${Math.floor(Math.random() * 999)}`;
    const pid = `${target}@c.us`;

    const lmsg = await bot.sendMessage(cid, "`│ DEPLOYING...`", { parse_mode: 'Markdown' });

    try {
        const res = await waClient.createGroup(name, [pid]);
        const gid = res.gid._serialized;
        const chat = await waClient.getChatById(gid);

        await chat.setMessagesAdminsOnly(true);
        await chat.setInfoAdminsOnly(true);
        await chat.setDescription('SECURE CHANNEL: AUTHORIZED PERSONNEL ONLY. ENCRYPTED SYSTEM.');

        const success = `\`\`\`\n┌────────────────────────\n│ ＳＵＣＣＥＳＳ\n├────────────────────────\n│ TARGET : ${target}\n│ NAME   : ${name}\n│ ID     : ${gid}\n│ CHAT   : LOCKED\n│ INFO   : LOCKED\n│ DESC   : INJECTED\n└────────────────────────\`\`\``;
        
        bot.editMessageText(success, { chat_id: cid, message_id: lmsg.message_id, parse_mode: 'Markdown' });
        
        cooldowns.add(cid);
        setTimeout(() => cooldowns.delete(cid), 60000);

    } catch (e) {
        bot.editMessageText(`\`│ ERROR : ${e.message}\``, { chat_id: cid, message_id: lmsg.message_id, parse_mode: 'Markdown' });
    }
});
