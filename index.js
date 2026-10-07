// ============================================================
// GHASHASH STORE BOT  -  Discord Premium Store Bot
// ============================================================
const fs = require('fs');
const path = require('path');
const http = require('http');
const {
  Client, GatewayIntentBits, Events,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, REST, Routes, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChannelType, PermissionFlagsBits
} = require('discord.js');

const config = require('./config.json');
config.token = process.env.TOKEN || process.env.DISCORD_TOKEN || config.token;

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const STORE_FILE = path.join(DATA_DIR, 'store.json');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');

function loadStore() {
  try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); }
  catch (e) { return { products: [], nextId: 1 }; }
}
function saveStore(s) { fs.writeFileSync(STORE_FILE, JSON.stringify(s, null, 2)); }
let store = loadStore();

function loadTickets() {
  try { return JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf8')); }
  catch (e) { return { tickets: [] }; }
}
function saveTickets(t) { fs.writeFileSync(TICKETS_FILE, JSON.stringify(t, null, 2)); }
let tickets = loadTickets();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  allowedMentions: { parse: ['everyone', 'users', 'roles'] }
});

// ---------- الأوامر ----------
const commands = [
  new SlashCommandBuilder().setName('createstore').setDescription('أظهر زر إنشاء متجر / منتج').setDefaultMemberPermissions(0),
  new SlashCommandBuilder().setName('ads').setDescription('أنشئ إعلانًا فاخرًا تفاعليًا لكل منتج').setDefaultMemberPermissions(0),
  new SlashCommandBuilder().setName('setup').setDescription('حدد رتبة الدعم الفني')
    .addRoleOption(o => o.setName('role').setDescription('رتبة الدعم').setRequired(true)).setDefaultMemberPermissions(0),
  new SlashCommandBuilder().setName('setcategory').setDescription('حدد كاتيقوري التذاكر / Set ticket category')
    .addChannelOption(o => o.setName('category').setDescription('الكاتيقوري / Category').setRequired(true).addChannelTypes(ChannelType.GuildCategory)).setDefaultMemberPermissions(0),
  new SlashCommandBuilder().setName('setwelcome').setDescription('حدد روم الترحيب / Set welcome channel')
    .addChannelOption(o => o.setName('channel').setDescription('القناة / Channel').setRequired(true).addChannelTypes(ChannelType.GuildText)).setDefaultMemberPermissions(0),
  new SlashCommandBuilder().setName('products').setDescription('اعرض كل المنتجات'),
  new SlashCommandBuilder().setName('newaccounts').setDescription('اعرض الحسابات الجديدة / Show new accounts by period').setDefaultMemberPermissions(0),
  new SlashCommandBuilder().setName('ping').setDescription('تحقق أن البوت يعمل')
];

const rest = new REST({ version: '10' }).setToken(config.token);
async function registerCommands() {
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Commands registered OK');
  } catch (e) { console.error('Commands FAIL: ' + e.message); }
}

function featuresText(p) {
  return (p.description || '')
    .split('\n').filter(Boolean).map(x => '• ' + x).join('\n') || '• Premium Quality';
}

function infoEmbed(p) {
  const embed = new EmbedBuilder()
    .setColor(config.color)
    .setTitle(p.name)
    .setDescription(featuresText(p))
    .setFooter({ text: config.botName })
    .setTimestamp();
  if (p.image) embed.setThumbnail(p.image);
  if (p.options && p.options.length) {
    embed.addFields({ name: '📦 Options / Packs', value: p.options.map(o => '• ' + o.label + ' — ' + config.currency + (o.price || '0') + (o.description ? ' | ' + o.description : '')).join('\n') });
  }
  return embed;
}

const RED = 0xFF0000;
function adEmbed(p) {
  const features = (p.description || '').split('\n').filter(Boolean).map(x => '• ' + x).join('\n');
  const desc = '# ' + p.name + (features ? '\n\n' + features : '');
  const embed = new EmbedBuilder()
    .setColor(RED)
    .setDescription(desc)
    .setFooter({ text: config.botName })
    .setTimestamp();
  if (p.image) embed.setImage(p.image);
  return embed;
}

async function pingEveryone(channel, guildId) {
  if (!channel || !guildId) return;
  try {
    const msg = await channel.send({
      content: '@everyone',
      allowedMentions: { parse: ['everyone', 'users', 'roles'] }
    });
    setTimeout(() => msg.delete().catch(() => {}), 8000);
  } catch (e) { console.error('MENTION FAILED: ' + e.message); }
}

function buildAd(p) {
  const rows = [];
  if (p.options && p.options.length) rows.push(planSelect(p));
  else rows.push(productBuyButton(p));
  return { embeds: [adEmbed(p)], components: rows };
}

function parseOptions(text) {
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
  const opts = [];
  for (let i = 0; i < lines.length; i += 2) {
    const label = lines[i];
    if (!label) continue;
    const desc = lines[i + 1] || '';
    const nums = label.match(/\d+(?:[.,]\d+)?/g);
    const price = nums ? nums[nums.length - 1].replace(',', '.') : '';
    opts.push({ label: label.slice(0, 100), description: desc.slice(0, 100), price });
  }
  return opts;
}

function planSelect(p) {
  const opts = (p.options || []).map((o, i) => new StringSelectMenuOptionBuilder()
    .setLabel(String(o.label).slice(0, 100))
    .setDescription(String(o.description || (o.price ? config.currency + o.price : '')).slice(0, 100))
    .setValue('opt_' + p.id + '_' + i));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('plan_' + p.id)
      .setPlaceholder('Select From Here')
      .addOptions(opts));
}

function productBuyButton(p) {
  const stockTxt = (p.stock !== '\u221E' && p.stock != null) ? ' - Remaining: ' + p.stock : '';
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('cart_' + p.id)
      .setLabel(p.name.toUpperCase())
      .setEmoji('\uD83D\uDED2')
      .setStyle(ButtonStyle.Success)
  ).addComponents(
    new ButtonBuilder()
      .setCustomId('buy_' + p.id)
      .setLabel((p.price ? config.currency + ' ' + p.price : '\uD83D\uDCE6 اختر الباقة') + ' ' + stockTxt)
      .setStyle(ButtonStyle.Success)
  );
}

function ticketButtons(locked) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('استلام التذكرة / Claim').setEmoji('\u2705').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_reminder').setLabel('تذكير / Reminder').setEmoji('\u23F0').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_lock').setLabel(locked ? 'فتح / Unlock' : 'قفل / Lock').setEmoji(locked ? '\uD83D\uDD13' : '\uD83D\uDD12').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('إغلاق / Close').setEmoji('\uD83D\uDD10').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف / Delete').setEmoji('\uD83D\uDDD1\uFE0F').setStyle(ButtonStyle.Danger)
  );
}

// ============================================================
client.once(Events.ClientReady, async (c) => {
  console.log('BOT ONLINE: ' + c.user.tag);
  await registerCommands();
});

// 🎉 نظام الترحيب عند دخول عضو جديد
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    if (!config.welcomeChannelId) return;
    const ch = member.guild.channels.cache.get(config.welcomeChannelId);
    if (!ch) return;

    const createdTs = Math.floor(member.user.createdTimestamp / 1000);
    const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
    const embed = new EmbedBuilder()
      .setColor(config.color || 0x00FFFF)
      .setAuthor({ name: 'عضو جديد انضم إلينا!', iconURL: member.guild.iconURL({ dynamic: true }) || undefined })
      .setTitle('🎉 أهلاً بك في ' + member.guild.name + ' 🎉')
      .setDescription(
        '╭──────────────────────────────╮\n' +
        '  💎 **نورت السيرفر يا غالي** 💎\n' +
        '╰──────────────────────────────╯\n\n' +
        '👤 **العضو:** ' + member + '\n' +
        '📛 **الاسم:** `' + member.user.username + '`\n' +
        '🆔 **الآيدي:** `' + member.id + '`\n' +
        '👥 **رقم العضو:** `#' + member.guild.memberCount + '`\n' +
        '📅 **عمر الحساب:** <t:' + createdTs + ':R> (`' + accountAgeDays + '` يوم)\n' +
        '🕐 **وقت الانضمام:** <t:' + Math.floor(Date.now() / 1000) + ':R>\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '🎁 **اتمنى لك وقتاً ممتعاً معنا!**\n' +
        '💬 اقرأ القوانين واستمتع بكل المميزات.'
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ text: config.botName + ' • Welcome System' })
      .setTimestamp();

    await ch.send({ content: '🎊 ' + member + ' مرحباً بك!', embeds: [embed] }).catch(() => {});
  } catch (e) { console.error('WELCOME ERR: ' + e.message); }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) return await handleCommand(interaction);
    if (interaction.isButton()) return await handleButton(interaction);
    if (interaction.isStringSelectMenu()) return await handleSelect(interaction);
    if (interaction.isModalSubmit()) return await handleModal(interaction);
  } catch (err) {
    console.error('ERR: ' + err.message);
    if (interaction.isRepliable() && !interaction.replied) interaction.reply({ content: 'error: ' + err.message, ephemeral: true }).catch(() => {});
  }
});

// ---------------- أوامر ----------------
async function handleCommand(interaction) {
  const c = interaction.commandName;
  if (c === 'ping') return interaction.reply({ content: 'Pong! bot works', ephemeral: true });

  if (c === 'setup') {
    config.supportRoleId = interaction.options.getRole('role').id;
    fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
    return interaction.reply({ content: '✅ تم تحديد رتبة الدعم / Support role set.', ephemeral: true });
  }

  if (c === 'setcategory') {
    config.ticketCategoryId = interaction.options.getChannel('category').id;
    fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
    return interaction.reply({ content: '✅ تم تحديد كاتيقوري التذاكر / Ticket category set.', ephemeral: true });
  }

  if (c === 'setwelcome') {
    config.welcomeChannelId = interaction.options.getChannel('channel').id;
    fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
    return interaction.reply({ content: '✅ تم تحديد روم الترحيب / Welcome channel set.', ephemeral: true });
  }

  // 📅 عرض الحسابات الجديدة
  if (c === 'newaccounts') {
    const select = new StringSelectMenuBuilder()
      .setCustomId('accounts_filter')
      .setPlaceholder('اختر الفترة الزمنية / Choose period')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('آخر أسبوع').setDescription('حسابات منشأة خلال 7 أيام').setValue('1w').setEmoji('📅'),
        new StringSelectMenuOptionBuilder().setLabel('آخر أسبوعين').setDescription('حسابات منشأة خلال 14 يوم').setValue('2w').setEmoji('📅'),
        new StringSelectMenuOptionBuilder().setLabel('آخر 3 أسابيع').setDescription('حسابات منشأة خلال 21 يوم').setValue('3w').setEmoji('📅'),
        new StringSelectMenuOptionBuilder().setLabel('آخر شهر').setDescription('حسابات منشأة خلال 30 يوم').setValue('1m').setEmoji('🗓️')
      );
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({ name: config.botName, iconURL: client.user.displayAvatarURL() })
      .setTitle('📅 الحسابات الجديدة / New Accounts')
      .setDescription(
        '╭──────────────────────────────╮\n' +
        '  ✨ **اختر الفترة الزمنية** ✨\n' +
        '╰──────────────────────────────╯\n\n' +
        '📅 **آخر أسبوع** — حسابات عمرها 7 أيام أو أقل\n' +
        '📅 **آخر أسبوعين** — حسابات عمرها 14 يوم أو أقل\n' +
        '📅 **آخر 3 أسابيع** — حسابات عمرها 21 يوم أو أقل\n' +
        '🗓️ **آخر شهر** — حسابات عمرها 30 يوم أو أقل\n\n' +
        '👇 اختر من القائمة أدناه'
      )
      .setFooter({ text: config.botName + ' • Accounts Filter' })
      .setTimestamp();
    return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
  }

  if (c === 'products') {
    if (!store.products.length) return interaction.reply({ content: 'No products.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    for (const p of store.products) await interaction.channel.send(buildAd(p)).catch(() => {});
    return interaction.editReply({ content: 'Shown ' + store.products.length + ' products.' });
  }

  if (c === 'createstore') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('create_store').setLabel('+ Create Store / Product').setEmoji('🛒').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('admin_panel').setLabel('⚙ Admin Panel').setEmoji('🎛️').setStyle(ButtonStyle.Secondary)
    );
    const embed = new EmbedBuilder()
      .setColor(config.accentColor || 0x00FFFF)
      .setTitle('🛒 ' + config.botName + ' CONTROL')
      .setDescription('**Admin Panel** — create your ads easily.\n\n• Press **Create Store** to add a product\n• **Admin Panel** to manage ads & settings')
      .setFooter({ text: config.botName });
    return interaction.reply({ embeds: [embed], components: [row] });
  }

  if (c === 'ads') {
    if (!store.products.length) return interaction.reply({ content: 'No products yet. Use /createstore first.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    let count = 0;
    for (const p of store.products) {
      await interaction.channel.send(buildAd(p)).catch(() => {});
      count++;
    }
    await pingEveryone(interaction.channel, interaction.guildId);
    return interaction.editReply({ content: 'Posted ' + count + ' premium ads.' });
  }
}

// ---------------- أزرار ----------------
async function handleButton(interaction) {
  const id = interaction.customId;

  if (id === 'create_store') {
    const modal = new ModalBuilder().setCustomId('product_modal').setTitle('\uD83D\uDED2 Add Product');
    const n = new TextInputBuilder().setCustomId('p_name').setLabel('Product Name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80);
    const pr = new TextInputBuilder().setCustomId('p_price').setLabel('Price (USD)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12);
    const img = new TextInputBuilder().setCustomId('p_image').setLabel('Large Image / Logo Link (URL)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(300);
    const desc = new TextInputBuilder().setCustomId('p_desc').setLabel('Features / text (one per line)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000);
    const opts = new TextInputBuilder().setCustomId('p_opts')
      .setLabel('Options (2 lines per option)')
      .setPlaceholder('Example:\n1 Day - $3\nWorks full day\n3 Days - $7\n3 days warranty')
      .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000);
    modal.addComponents(
      new ActionRowBuilder().addComponents(n),
      new ActionRowBuilder().addComponents(pr),
      new ActionRowBuilder().addComponents(img),
      new ActionRowBuilder().addComponents(desc),
      new ActionRowBuilder().addComponents(opts)
    );
    return interaction.showModal(modal);
  }

  if (id === 'admin_panel') {
    const embed = new EmbedBuilder().setColor(config.color)
      .setTitle('⚙ Admin Panel')
      .setDescription('Commands:\n• `/createstore` - show store buttons\n• `/ads` - post premium ads\n• `/setup role:@support` - set support role\n• `/setcategory #category` - set ticket category\n• `/setwelcome #channel` - set welcome channel\n• `/newaccounts` - show new accounts by period\n• `/products` - show all products');
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (id.startsWith('cart_') || id.startsWith('buy_')) {
    const pid = parseInt(id.split('_')[1]);
    const p = store.products.find(x => x.id === pid);
    if (!p) return interaction.reply({ content: 'Not found', ephemeral: true });
    return openTicket(interaction, p);
  }

  if (id.startsWith('info_')) {
    const pid = parseInt(id.split('_')[1]);
    const p = store.products.find(x => x.id === pid);
    if (!p) return interaction.reply({ content: 'Not found', ephemeral: true });
    return interaction.reply({ embeds: [infoEmbed(p)], ephemeral: true });
  }

  if (id.startsWith('ticket_')) return handleTicketButton(interaction, id);
}

// ---------------- Select Menu ----------------
async function handleSelect(interaction) {
  // 📅 فلتر الحسابات الجديدة
  if (interaction.customId === 'accounts_filter') {
    await interaction.deferUpdate().catch(() => {});
    const period = interaction.values[0];
    const map = { '1w': 7, '2w': 14, '3w': 21, '1m': 30 };
    const names = { '1w': 'آخر أسبوع', '2w': 'آخر أسبوعين', '3w': 'آخر 3 أسابيع', '1m': 'آخر شهر' };
    const days = map[period];
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    try {
      // جلب كل الأعضاء
      await interaction.guild.members.fetch();
    } catch (e) { console.log('Fetch members err: ' + e.message); }

    const matched = [];
    interaction.guild.members.cache.forEach(m => {
      if (m.user.bot) return;
      if (m.user.createdTimestamp >= cutoff) {
        matched.push({
          id: m.id,
          tag: m.user.username,
          created: m.user.createdTimestamp,
          joined: m.joinedTimestamp,
          member: m
        });
      }
    });

    // ترتيب من الأحدث للأقدم
    matched.sort((a, b) => b.created - a.created);

    if (!matched.length) {
      const empty = new EmbedBuilder()
        .setColor(0xFF0000)
        .setAuthor({ name: config.botName, iconURL: client.user.displayAvatarURL() })
        .setTitle('📅 الحسابات الجديدة — ' + names[period])
        .setDescription('╭──────────────────────────────╮\n  ❌ **لا توجد حسابات** ❌\n╰──────────────────────────────╯\n\nلم يتم العثور على أي حساب تم إنشاؤه خلال ' + names[period] + '.')
        .setFooter({ text: config.botName + ' • Accounts Filter' })
        .setTimestamp();
      return interaction.editReply({ embeds: [empty], components: [] }).catch(() => {});
    }

    const lines = matched.slice(0, 30).map((m, i) => {
      const createdTs = Math.floor(m.created / 1000);
      const joinedStr = m.joined ? '<t:' + Math.floor(m.joined / 1000) + ':R>' : '`غير معروف`';
      return '`' + (i + 1) + '.` <@' + m.id + '> — <t:' + createdTs + ':R> • انضم: ' + joinedStr;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({ name: config.botName + ' • Accounts Archive', iconURL: client.user.displayAvatarURL() })
      .setTitle('📅 الحسابات الجديدة — ' + names[period])
      .setDescription(
        '╭──────────────────────────────╮\n' +
        '  ✨ **تم العثور على الحسابات** ✨\n' +
        '╰──────────────────────────────╯\n\n' +
        '📊 **العدد الكلي:** `' + matched.length + '` حساب\n' +
        '🗓️ **الفترة:** ' + names[period] + '\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        lines +
        (matched.length > 30 ? '\n\n⚠️ **يتم عرض أول 30 حساب فقط**' : '')
      )
      .setFooter({ text: config.botName + ' • Accounts Filter' })
      .setTimestamp();

    // إرسال رسالة فيها كل الحسابات ممنشنة
    const mentionList = matched.slice(0, 30).map(m => '<@' + m.id + '>').join(' ');
    await interaction.channel.send({
      content: '📢 **حسابات جديدة (' + names[period] + '):**\n' + mentionList
    }).catch(() => {});

    return interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
  }

  if (interaction.customId.startsWith('plan_')) {
    const pid = parseInt(interaction.customId.split('_')[1]);
    const p = store.products.find(x => x.id === pid);
    if (!p) return interaction.reply({ content: 'Not found', ephemeral: true });
    const idx = parseInt(interaction.values[0].split('_')[2]);
    const plan = (p.options || [])[idx];
    if (!plan) return interaction.reply({ content: 'Option not found', ephemeral: true });
    return openTicket(interaction, p, plan);
  }
}

// ---------------- تذكرة (قناة جديدة) ----------------
async function openTicket(interaction, p, plan) {
  const user = interaction.user;
  const guild = interaction.guild;
  if (!guild) return interaction.reply({ content: 'لا يمكن فتح تذكرة هنا / Cannot open ticket here.', ephemeral: true });

  if (!config.ticketCategoryId) {
    return interaction.reply({ content: '❌ لم يتم تحديد كاتيقوري التذاكر بعد.\nاستخدم `/setcategory` أولاً.\nTicket category not set. Use `/setcategory` first.', ephemeral: true });
  }

  const category = guild.channels.cache.get(config.ticketCategoryId);
  if (!category) return interaction.reply({ content: '❌ الكاتيقوري غير موجود / Category not found.', ephemeral: true });

  const pp = plan ? (plan.price || p.price) : (p.price || '0');
  const planTxt = plan ? config.currency + pp + ' — ' + plan.label : config.currency + pp;
  const channelName = 'ticket-' + user.username.slice(0, 30).toLowerCase().replace(/[^a-z0-9]/g, '') + (plan ? '-' + plan.label.slice(0, 10).toLowerCase().replace(/[^a-z0-9]/g, '') : '');

  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create({
      name: channelName || 'ticket',
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ...(config.supportRoleId ? [{ id: config.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : [])
      ]
    });
  } catch (e) {
    return interaction.reply({ content: '❌ فشل إنشاء القناة / Failed to create channel: ' + e.message, ephemeral: true });
  }

  const roleMention = config.supportRoleId ? '<@&' + config.supportRoleId + '>' : '@Support (set via /setup)';
  const nowTs = Math.floor(Date.now() / 1000);

  // 🎫 رسالة تذكرة فخمة ومنظمة
  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setAuthor({ name: config.botName + ' • Premium Purchase Ticket', iconURL: client.user.displayAvatarURL() })
    .setTitle('🎫 تذكرة شراء فاخرة / Premium Purchase Ticket')
    .setDescription(
      '╭────────────────────────────────╮\n' +
      '     💎 **مرحباً بك في متجرنا** 💎\n' +
      '╰────────────────────────────────╯\n\n' +
      '> 👤 **العميل / Customer:**\n' +
      '> ' + user + ' (`' + user.username + '`)\n\n' +
      '> 📦 **المنتج / Product:**\n' +
      '> `' + p.name + '` — **#' + p.id + '**\n\n' +
      '> 💰 **السعر / Price:**\n' +
      '> `' + planTxt + '`\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '⏳ **في انتظار استلام أحد أعضاء الدعم الفني...**\n' +
      '> Waiting for a support member to claim...\n\n' +
      '⚠️ **تنبيه:** يرجى الانتظار حتى يتم استلام تذكرتك\n' +
      '⚠️ **Warning:** Please wait until your ticket is claimed\n' +
      '🕐 **تاريخ الفتح:** <t:' + nowTs + ':R>'
    )
    .setFooter({ text: config.botName + ' • Premium Service • ' + guild.name, iconURL: guild.iconURL({ dynamic: true }) || undefined })
    .setTimestamp();
  if (p.image) embed.setThumbnail(p.image);
  if (plan) embed.addFields({ name: '📦 الخيار المختار / Selected Option', value: '`' + plan.label + '` — `' + config.currency + (plan.price || pp) + '`', inline: false });

  // ⬇️ منشن صاحب التذكرة + رتبة الدعم
  await ticketChannel.send({
    content: '👋 ' + user + ' | ' + roleMention,
    embeds: [embed],
    components: [ticketButtons(false)]
  });

  tickets.tickets.push({
    channelId: ticketChannel.id,
    userId: user.id,
    userName: user.username,
    productName: p.name,
    claimed: false
  });
  saveTickets(tickets);

  const replyEmbed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setAuthor({ name: config.botName, iconURL: client.user.displayAvatarURL() })
    .setTitle('🎫 تذكرتك جاهزة / Your Ticket Is Ready')
    .setDescription(
      '╭──────────────────────────────╮\n' +
      '  ✅ **تم إنشاء تذكرتك بنجاح** ✅\n' +
      '╰──────────────────────────────╯\n\n' +
      '📦 **المنتج / Product:** `' + p.name + '`\n' +
      '💰 **السعر / Price:** `' + planTxt + '`\n\n' +
      '👇 **اضغط الزر للانتقال للتذكرة / Click to go to your ticket:**'
    )
    .setTimestamp()
    .setFooter({ text: config.botName });
  if (p.image) replyEmbed.setThumbnail(p.image);

  const goBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('تذكرتك / Your Ticket')
      .setURL('https://discord.com/channels/' + guild.id + '/' + ticketChannel.id)
      .setStyle(ButtonStyle.Link)
  );

  return interaction.reply({ embeds: [replyEmbed], components: [goBtn], ephemeral: true });
}

// ---------------- أزرار التذاكر ----------------
async function handleTicketButton(interaction, id) {
  const ch = interaction.channel;
  const isStaff = !config.supportRoleId || (interaction.member && interaction.member.roles && interaction.member.roles.cache.has(config.supportRoleId));
  const ticketData = tickets.tickets.find(t => t.channelId === ch.id);

  try {
    if (!isStaff) {
      await interaction.reply({ content: '⚠️ فقط الدعم الفني يمكنه استخدام هذه الأزرار / Only support role can use these buttons.', ephemeral: true });
      return;
    }

    if (id === 'ticket_claim') {
      if (!ticketData) return interaction.reply({ content: '❌ بيانات التذكرة غير موجودة / Ticket data not found.', ephemeral: true });
      if (ticketData.claimed) return interaction.reply({ content: '⚠️ التذكرة تم استلامها مسبقاً / Ticket already claimed.', ephemeral: true });

      ticketData.claimed = true;
      // ✅ بدون منشن — نستخدم الاسم فقط
      const claimerName = interaction.member && interaction.member.displayName
        ? interaction.member.displayName
        : interaction.user.username;
      ticketData.claimedBy = claimerName;
      saveTickets(tickets);

      const oldEmbed = interaction.message.embeds[0];
      const newEmbed = EmbedBuilder.from(oldEmbed)
        .setColor(0x00FF00)
        .setDescription(
          oldEmbed.description
            .replace('⏳ **في انتظار استلام أحد أعضاء الدعم الفني...**\n> Waiting for a support member to claim...',
              '✅ **تم استلام التذكرة بواسطة / Ticket claimed by:**\n> `' + claimerName + '`\n> <t:' + Math.floor(Date.now() / 1000) + ':R>')
            .replace('⏳ **في انتظار الاستلام / Waiting to be claimed...**',
              '✅ **تم الاستلام بواسطة / Claimed by:** `' + claimerName + '`')
        );
      await interaction.message.edit({ embeds: [newEmbed], components: [ticketButtons(false)] }).catch(() => {});

      try {
        const ticketUser = await client.users.fetch(ticketData.userId);
        const dmEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setAuthor({ name: config.botName, iconURL: client.user.displayAvatarURL() })
          .setTitle('🎫 تم استلام تذكرتك / Your Ticket Has Been Claimed')
          .setDescription(
            'مرحباً ' + ticketUser + ' 👋\n\n' +
            '✅ **تم استلام تذكرتك بواسطة / Claimed by:** `' + claimerName + '`\n' +
            '📦 **المنتج / Product:** `' + ticketData.productName + '`\n\n' +
            '📞 **سيتم التواصل معك قريباً / You will be contacted soon.**'
          )
          .setTimestamp()
          .setFooter({ text: config.botName });
        await ticketUser.send({ embeds: [dmEmbed] }).catch(() => {});
      } catch (dmErr) { console.log('Could not DM user: ' + dmErr.message); }

      await interaction.reply({ content: '✅ تم استلام التذكرة / Ticket claimed!', ephemeral: true });
      return;
    }

    if (id === 'ticket_reminder') {
      if (!ticketData) return interaction.reply({ content: '❌ بيانات التذكرة غير موجودة / Ticket data not found.', ephemeral: true });
      try {
        const ticketUser = await client.users.fetch(ticketData.userId);
        const reminderEmbed = new EmbedBuilder()
          .setColor(0xFFAA00)
          .setTitle('⏰ تذكير / Reminder')
          .setDescription(
            'مرحباً ' + ticketUser + ' 👋\n\n' +
            '⏰ **تذكير بخصوص تذكرتك / This is a reminder about your ticket.**\n' +
            '📦 **المنتج / Product:** `' + ticketData.productName + '`\n\n' +
            '⚠️ **تنبيه: سيتم إغلاق التذكرة في حال عدم الرد خلال وقت قريب.**\n' +
            '⚠️ **Warning: The ticket will be closed if you do not respond soon.**\n\n' +
            '📩 **يرجى الرد في روم التذكرة / Please reply in the ticket channel.**'
          )
          .setTimestamp()
          .setFooter({ text: config.botName });
        await ticketUser.send({ embeds: [reminderEmbed] }).catch(() => {});
      } catch (dmErr) { console.log('Could not DM user: ' + dmErr.message); }
      await interaction.reply({ content: '⏰ تم إرسال التذكير لصاحب التذكرة / Reminder sent.', ephemeral: true });
      return;
    }

    if (id === 'ticket_lock') {
      await interaction.deferUpdate().catch(() => {});
      const nowLocked = !(ch && ch.locked);
      await interaction.message.edit({ components: [ticketButtons(nowLocked)] }).catch(() => {});
      await interaction.followUp({ content: nowLocked ? '🔒 تم قفل التذكرة / Ticket locked.' : '🔓 تم فتح التذكرة / Ticket unlocked.', ephemeral: true }).catch(() => {});
      return;
    }

    if (id === 'ticket_close') {
      await interaction.deferUpdate().catch(() => {});
      await interaction.followUp({ content: '🔒 تم إغلاق التذكرة / Ticket closed.', ephemeral: true }).catch(() => {});
      return;
    }

    if (id === 'ticket_delete') {
      await interaction.deferUpdate().catch(() => {});
      tickets.tickets = tickets.tickets.filter(t => t.channelId !== ch.id);
      saveTickets(tickets);
      if (ch && typeof ch.delete === 'function') { await ch.delete('ticket deleted').catch(() => {}); }
      return;
    }

    await interaction.reply({ content: 'done', ephemeral: true });
  } catch (e) {
    console.error('TICKET ERR: ' + e.message);
    await interaction.reply({ content: 'Error: ' + e.message, ephemeral: true }).catch(() => {});
  }
}

// ---------------- Modal ----------------
async function handleModal(interaction) {
  if (interaction.customId !== 'product_modal') return;
  const get = (k) => { try { return interaction.fields.getTextInputValue(k).trim(); } catch (e) { return ''; } };
  const name = get('p_name') || 'Untitled';
  const price = get('p_price') || '0.00';
  const image = get('p_image');
  const desc = get('p_desc');
  const optsText = get('p_opts');

  const p = {
    id: store.nextId++,
    name, price, image,
    tagline: 'Premium Quality',
    category: 'Tools',
    description: desc,
    options: parseOptions(optsText),
    stock: '\u221E'
  };
  store.products.push(p);
  saveStore(store);

  await interaction.reply({ content: 'Added #' + p.id + ' ' + p.name + (p.options.length ? ' with ' + p.options.length + ' options.' : '') + ' Use /ads to post it.', ephemeral: true }).catch(() => {});

  if (interaction.channel) {
    await interaction.channel.send(buildAd(p)).catch(() => {});
    await pingEveryone(interaction.channel, interaction.guildId);
  }
}

// ---------- تشغيل ----------
process.on('unhandledRejection', (r) => console.error('UNHANDLED REJECTION:', r && (r.message || r)));
process.on('uncaughtException', (e) => console.error('UNCAUGHT EXCEPTION:', e && (e.message || e)));

const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running');
}).listen(PORT, () => console.log('HTTP server listening on port ' + PORT));

client.login(config.token).then(() => console.log('Logging in...')).catch((err) => {
  console.error('LOGIN FAIL: ' + err.message);
  process.exit(1);
});
