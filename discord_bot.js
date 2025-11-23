const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, Partials, ChannelType, SlashCommandBuilder } = require('discord.js');

const disablePriv = process.env.DISABLE_PRIVILEGED_INTENTS === '1';
const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent];
if (!disablePriv) {
  intents.push(GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences);
}

const client = new Client({ intents, partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User] });
let settingsStore = {};
const commandsUsed = new Map();
const bannedWords = ['spamlink.com'];
const settingsPath = path.join(__dirname, 'settings.json');

function loadSettings() {
  if (fs.existsSync(settingsPath)) {
    try {
      settingsStore = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch (_) {
      settingsStore = {};
    }
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settingsStore, null, 2), 'utf-8');
  } catch (_) {}
}

function defaultSettings() {
  return {
    welcome: { enabled: false, channel_id: null, message: '{user}님 환영합니다!' },
    moderation: { enabled: true, log_channel_id: null, auto_mod: false },
    music: { volume: 50, dj_role_id: null }
  };
}

async function sendModLog(guild, content) {
  const cfg = settingsStore[String(guild.id)] || {};
  const mod = cfg.moderation || {};
  const chId = mod.log_channel_id;
  if (!chId) return;
  const ch = guild.channels.cache.get(String(chId)) || null;
  if (!ch) return;
  try { await ch.send(content); } catch (_) {}
}

client.on('ready', async () => {
  const cmds = [
    new SlashCommandBuilder().setName('핑').setDescription('핑'),
    new SlashCommandBuilder().setName('echo').setDescription('메시지 에코').addStringOption(o=>o.setName('message').setDescription('메시지').setRequired(true)),
    new SlashCommandBuilder().setName('대시보드').setDescription('대시보드 링크'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('서버 정보'),
    new SlashCommandBuilder().setName('userinfo').setDescription('유저 정보').addUserOption(o=>o.setName('member').setDescription('유저')),
    new SlashCommandBuilder().setName('clear').setDescription('메시지 삭제').addIntegerOption(o=>o.setName('amount').setDescription('수량(1-100)').setRequired(true)),
    new SlashCommandBuilder().setName('kick').setDescription('멤버 추방').addUserOption(o=>o.setName('member').setDescription('유저').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('사유')),
    new SlashCommandBuilder().setName('ban').setDescription('멤버 차단').addUserOption(o=>o.setName('member').setDescription('유저').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('사유')),
    new SlashCommandBuilder().setName('poll').setDescription('투표 생성').addStringOption(o=>o.setName('question').setDescription('질문').setRequired(true)),
    new SlashCommandBuilder().setName('설정').setDescription('현재 설정 확인'),
    new SlashCommandBuilder().setName('warn').setDescription('유저 경고').addUserOption(o=>o.setName('member').setDescription('유저').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('사유')),
    new SlashCommandBuilder().setName('mute').setDescription('유저 뮤트').addUserOption(o=>o.setName('member').setDescription('유저').setRequired(true)).addIntegerOption(o=>o.setName('minutes').setDescription('분').setRequired(false)),
    new SlashCommandBuilder().setName('unmute').setDescription('유저 언뮤트').addUserOption(o=>o.setName('member').setDescription('유저').setRequired(true)),
    new SlashCommandBuilder().setName('slowmode').setDescription('슬로우모드 설정').addIntegerOption(o=>o.setName('seconds').setDescription('초').setRequired(true)),
    new SlashCommandBuilder().setName('purgeuser').setDescription('유저 메시지 삭제').addUserOption(o=>o.setName('member').setDescription('유저').setRequired(true)).addIntegerOption(o=>o.setName('amount').setDescription('수량').setRequired(false)),
    new SlashCommandBuilder().setName('announce').setDescription('공지 전송').addStringOption(o=>o.setName('message').setDescription('메시지').setRequired(true))
  ].map(c=>c.toJSON());
  try { await client.application.commands.set(cmds); } catch (_) {}
  console.log(`${client.user.tag} connected`);
});

client.on('guildMemberAdd', async member => {
  const cfg = settingsStore[String(member.guild.id)];
  if (!cfg) return;
  const w = cfg.welcome;
  if (!w || !w.enabled) return;
  const chId = w.channel_id;
  const msg = w.message || '';
  if (!chId) return;
  const ch = member.guild.channels.cache.get(String(chId));
  if (!ch) return;
  try { await ch.send(msg.replace('{user}', `<@${member.id}>`)); } catch (_) {}
});

client.on('messageCreate', async msg => {
  if (!msg.guild || msg.author.bot) return;
  const gidAuto = String(msg.guild.id);
  const cfgAuto = settingsStore[gidAuto] || defaultSettings();
  if (cfgAuto.moderation && cfgAuto.moderation.auto_mod) {
    const lowered = msg.content.toLowerCase();
    if (bannedWords.some(w=>lowered.includes(w.toLowerCase()))) {
      try { await msg.delete(); } catch (_) {}
      await sendModLog(msg.guild, `AUTOMOD delete by ${msg.author} in ${msg.channel}`);
      return;
    }
  }
  const prefix = '!';
  if (!msg.content.startsWith(prefix)) return;
  const [cmd, ...rest] = msg.content.slice(prefix.length).trim().split(/\s+/);
  const gid = String(msg.guild.id);
  commandsUsed.set(gid, (commandsUsed.get(gid) || 0) + 1);
  if (cmd === 'ping') { await msg.reply('Pong!'); }
  else if (cmd === 'echo') { await msg.reply(rest.join(' ')); }
  else if (cmd === '대시보드' || cmd === 'dashboard') { await msg.reply('https://plugmarket.r-e.kr/'); }
  else if (cmd === 'serverinfo') {
    const g = msg.guild;
    await msg.reply(`서버: ${g.name} 채널: ${g.channels.cache.size} 역할: ${g.roles.cache.size}`);
  } else if (cmd === 'userinfo') {
    const m = msg.mentions.members.first() || msg.member;
    await msg.reply(`유저: ${m.displayName} ID: ${m.id}`);
  } else if (cmd === 'clear') {
    const n = Math.max(1, Math.min(100, parseInt(rest[0] || '0')));
    if (!msg.member.permissions.has('ManageMessages')) { await msg.reply('권한이 부족합니다'); return; }
    const deleted = await msg.channel.bulkDelete(n, true).catch(()=>null);
    await msg.reply(`삭제: ${deleted ? deleted.size : 0}`);
    await sendModLog(msg.guild, `CLEAR ${deleted ? deleted.size : 0} by ${msg.author} in ${msg.channel}`);
  } else if (cmd === 'kick') {
    if (!msg.member.permissions.has('KickMembers')) { await msg.reply('권한이 부족합니다'); return; }
    const target = msg.mentions.members.first();
    const reason = rest.slice(1).join(' ') || null;
    if (!target) { await msg.reply('대상 유저가 필요합니다'); return; }
    try { await target.kick(reason); await msg.reply(`${target} 추방`); await sendModLog(msg.guild, `KICK ${target} by ${msg.author} reason: ${reason || '-'}`); } catch (_) { await msg.reply('오류가 발생했습니다'); }
  } else if (cmd === 'ban') {
    if (!msg.member.permissions.has('BanMembers')) { await msg.reply('권한이 부족합니다'); return; }
    const target = msg.mentions.members.first();
    const reason = rest.slice(1).join(' ') || null;
    if (!target) { await msg.reply('대상 유저가 필요합니다'); return; }
    try { await target.ban({ reason }); await msg.reply(`${target} 차단`); await sendModLog(msg.guild, `BAN ${target} by ${msg.author} reason: ${reason || '-'}`); } catch (_) { await msg.reply('오류가 발생했습니다'); }
  } else if (cmd === 'poll') {
    const q = rest.join(' ');
    const m = await msg.channel.send(`투표: ${q}`);
    try { await m.react('👍'); await m.react('👎'); } catch (_) {}
  } else if (cmd === '설정') {
    const s = settingsStore[String(msg.guild.id)] || defaultSettings();
    const lines = [];
    lines.push(`환영: ${s.welcome.enabled ? 'ON' : 'OFF'} 채널: ${s.welcome.channel_id || '-'}`);
    lines.push(`모더레이션: ${s.moderation.enabled ? 'ON' : 'OFF'} 자동: ${s.moderation.auto_mod ? 'ON' : 'OFF'} 로그: ${s.moderation.log_channel_id || '-'}`);
    lines.push(`음악: 볼륨 ${s.music.volume}% DJ 역할: ${s.music.dj_role_id || '-'}`);
    await msg.reply(lines.join('\n'));
  } else if (cmd === 'warn') {
    if (!msg.member.permissions.has('KickMembers')) { await msg.reply('권한이 부족합니다'); return; }
    const target = msg.mentions.members.first();
    const reason = rest.slice(1).join(' ') || '-';
    if (!target) { await msg.reply('대상 유저가 필요합니다'); return; }
    await msg.reply(`${target} 경고: ${reason}`);
    await sendModLog(msg.guild, `WARN ${target} by ${msg.author} reason: ${reason}`);
  } else if (cmd === 'mute') {
    if (!msg.member.permissions.has('MuteMembers')) { await msg.reply('권한이 부족합니다'); return; }
    const target = msg.mentions.members.first();
    const minutes = parseInt(rest[1] || '0');
    if (!target) { await msg.reply('대상 유저가 필요합니다'); return; }
    const roleId = await ensureMuteRole(msg.guild);
    if (!roleId) { await msg.reply('Mute 역할을 만들 수 없습니다'); return; }
    try { await target.roles.add(roleId); } catch (_) { await msg.reply('역할 부여 실패'); return; }
    await msg.reply(`${target} 뮤트`);
    await sendModLog(msg.guild, `MUTE ${target} by ${msg.author} ${minutes>0?minutes+'m':''}`);
    if (minutes>0) setTimeout(async ()=>{ try { await target.roles.remove(roleId); await sendModLog(msg.guild, `UNMUTE ${target}`); } catch (_) {} }, minutes*60*1000);
  } else if (cmd === 'unmute') {
    if (!msg.member.permissions.has('MuteMembers')) { await msg.reply('권한이 부족합니다'); return; }
    const target = msg.mentions.members.first();
    if (!target) { await msg.reply('대상 유저가 필요합니다'); return; }
    const roleId = await ensureMuteRole(msg.guild);
    try { await target.roles.remove(roleId); await msg.reply(`${target} 언뮤트`); await sendModLog(msg.guild, `UNMUTE ${target} by ${msg.author}`); } catch (_) { await msg.reply('역할 제거 실패'); }
  } else if (cmd === 'slowmode') {
    if (!msg.member.permissions.has('ManageChannels')) { await msg.reply('권한이 부족합니다'); return; }
    const secs = Math.max(0, Math.min(21600, parseInt(rest[0]||'0')));
    try { await msg.channel.setRateLimitPerUser(secs); await msg.reply(`슬로우모드 ${secs}s`); } catch (_) { await msg.reply('설정 실패'); }
  } else if (cmd === 'purgeuser') {
    if (!msg.member.permissions.has('ManageMessages')) { await msg.reply('권한이 부족합니다'); return; }
    const target = msg.mentions.members.first();
    const n = Math.max(1, Math.min(100, parseInt(rest[1]||'10')));
    if (!target) { await msg.reply('대상 유저가 필요합니다'); return; }
    const messages = await msg.channel.messages.fetch({ limit: 100 }).catch(()=>null);
    const toDelete = messages ? messages.filter(m=>m.author.id===target.id).first(n) : [];
    let count = 0;
    for (const m of toDelete) { try { await m.delete(); count++; } catch (_) {} }
    await msg.reply(`유저 메시지 삭제: ${count}`);
    await sendModLog(msg.guild, `PURGEUSER ${count} of ${target} by ${msg.author} in ${msg.channel}`);
  } else if (cmd === 'announce') {
    const content = rest.join(' ');
    if (!content) { await msg.reply('메시지가 필요합니다'); return; }
    await msg.channel.send(`공지: ${content}`);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const n = interaction.commandName;
  const gid = String(interaction.guild.id);
  commandsUsed.set(gid, (commandsUsed.get(gid) || 0) + 1);
  if (n === '핑') { await interaction.reply('Pong!'); }
  else if (n === 'echo') { await interaction.reply(interaction.options.getString('message')); }
  else if (n === '대시보드') { await interaction.reply('https://plugmarket.r-e.kr/'); }
  else if (n === 'serverinfo') {
    const g = interaction.guild;
    await interaction.reply(`서버: ${g.name} 채널: ${g.channels.cache.size} 역할: ${g.roles.cache.size}`);
  } else if (n === 'userinfo') {
    const m = interaction.options.getMember('member') || interaction.member;
    await interaction.reply(`유저: ${m.displayName} ID: ${m.id}`);
  } else if (n === 'clear') {
    const amt = Math.max(1, Math.min(100, interaction.options.getInteger('amount')));
    if (!interaction.memberPermissions.has('ManageMessages')) { await interaction.reply({ content: '권한이 부족합니다', ephemeral: true }); return; }
    const deleted = await interaction.channel.bulkDelete(amt, true).catch(()=>null);
    await interaction.reply(`삭제: ${deleted ? deleted.size : 0}`);
    await sendModLog(interaction.guild, `CLEAR ${deleted ? deleted.size : 0} by ${interaction.user} in ${interaction.channel}`);
  } else if (n === 'kick') {
    if (!interaction.memberPermissions.has('KickMembers')) { await interaction.reply({ content: '권한이 부족합니다', ephemeral: true }); return; }
    const target = interaction.options.getMember('member');
    const reason = interaction.options.getString('reason') || null;
    try { await target.kick(reason); await interaction.reply(`${target} 추방`); await sendModLog(interaction.guild, `KICK ${target} by ${interaction.user} reason: ${reason || '-'}`); } catch (_) { await interaction.reply({ content: '오류가 발생했습니다', ephemeral: true }); }
  } else if (n === 'ban') {
    if (!interaction.memberPermissions.has('BanMembers')) { await interaction.reply({ content: '권한이 부족합니다', ephemeral: true }); return; }
    const target = interaction.options.getMember('member');
    const reason = interaction.options.getString('reason') || null;
    try { await target.ban({ reason }); await interaction.reply(`${target} 차단`); await sendModLog(interaction.guild, `BAN ${target} by ${interaction.user} reason: ${reason || '-'}`); } catch (_) { await interaction.reply({ content: '오류가 발생했습니다', ephemeral: true }); }
  } else if (n === 'poll') {
    const q = interaction.options.getString('question');
    const m = await interaction.channel.send(`투표: ${q}`);
    try { await m.react('👍'); await m.react('👎'); } catch (_) {}
    await interaction.reply({ content: '투표 생성', ephemeral: true });
  } else if (n === '설정') {
    const s = settingsStore[String(interaction.guild.id)] || defaultSettings();
    const lines = [];
    lines.push(`환영: ${s.welcome.enabled ? 'ON' : 'OFF'} 채널: ${s.welcome.channel_id || '-'}`);
    lines.push(`모더레이션: ${s.moderation.enabled ? 'ON' : 'OFF'} 자동: ${s.moderation.auto_mod ? 'ON' : 'OFF'} 로그: ${s.moderation.log_channel_id || '-'}`);
    lines.push(`음악: 볼륨 ${s.music.volume}% DJ 역할: ${s.music.dj_role_id || '-'}`);
    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
  } else if (n === 'warn') {
    if (!interaction.memberPermissions.has('KickMembers')) { await interaction.reply({ content: '권한이 부족합니다', ephemeral: true }); return; }
    const target = interaction.options.getMember('member');
    const reason = interaction.options.getString('reason') || '-';
    await interaction.reply(`${target} 경고: ${reason}`);
    await sendModLog(interaction.guild, `WARN ${target} by ${interaction.user} reason: ${reason}`);
  } else if (n === 'mute') {
    if (!interaction.memberPermissions.has('MuteMembers')) { await interaction.reply({ content: '권한이 부족합니다', ephemeral: true }); return; }
    const target = interaction.options.getMember('member');
    const minutes = interaction.options.getInteger('minutes') || 0;
    const roleId = await ensureMuteRole(interaction.guild);
    if (!roleId) { await interaction.reply({ content: 'Mute 역할을 만들 수 없습니다', ephemeral: true }); return; }
    try { await target.roles.add(roleId); } catch (_) { await interaction.reply({ content: '역할 부여 실패', ephemeral: true }); return; }
    await interaction.reply(`${target} 뮤트`);
    await sendModLog(interaction.guild, `MUTE ${target} by ${interaction.user} ${minutes>0?minutes+'m':''}`);
    if (minutes>0) setTimeout(async ()=>{ try { await target.roles.remove(roleId); await sendModLog(interaction.guild, `UNMUTE ${target}`); } catch (_) {} }, minutes*60*1000);
  } else if (n === 'unmute') {
    if (!interaction.memberPermissions.has('MuteMembers')) { await interaction.reply({ content: '권한이 부족합니다', ephemeral: true }); return; }
    const target = interaction.options.getMember('member');
    const roleId = await ensureMuteRole(interaction.guild);
    try { await target.roles.remove(roleId); await interaction.reply(`${target} 언뮤트`); await sendModLog(interaction.guild, `UNMUTE ${target} by ${interaction.user}`); } catch (_) { await interaction.reply({ content: '역할 제거 실패', ephemeral: true }); }
  } else if (n === 'slowmode') {
    if (!interaction.memberPermissions.has('ManageChannels')) { await interaction.reply({ content: '권한이 부족합니다', ephemeral: true }); return; }
    const secs = Math.max(0, Math.min(21600, interaction.options.getInteger('seconds')));
    try { await interaction.channel.setRateLimitPerUser(secs); await interaction.reply(`슬로우모드 ${secs}s`); } catch (_) { await interaction.reply({ content: '설정 실패', ephemeral: true }); }
  } else if (n === 'purgeuser') {
    if (!interaction.memberPermissions.has('ManageMessages')) { await interaction.reply({ content: '권한이 부족합니다', ephemeral: true }); return; }
    const target = interaction.options.getMember('member');
    const n = Math.max(1, Math.min(100, interaction.options.getInteger('amount')||10));
    const messages = await interaction.channel.messages.fetch({ limit: 100 }).catch(()=>null);
    const toDelete = messages ? messages.filter(m=>m.author.id===target.id).first(n) : [];
    let count = 0;
    for (const m of toDelete) { try { await m.delete(); count++; } catch (_) {} }
    await interaction.reply(`유저 메시지 삭제: ${count}`);
    await sendModLog(interaction.guild, `PURGEUSER ${count} of ${target} by ${interaction.user} in ${interaction.channel}`);
  } else if (n === 'announce') {
    const content = interaction.options.getString('message');
    if (!content) { await interaction.reply({ content: '메시지가 필요합니다', ephemeral: true }); return; }
    await interaction.channel.send(`공지: ${content}`);
    await interaction.reply({ content: '공지 전송', ephemeral: true });
  }
});

loadSettings();

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/auth/session', (req, res) => {
  const user = { id: '0', username: 'Dashboard Admin', global_name: 'Dashboard Admin', avatar: null };
  const guilds = client.guilds.cache.map(g => ({ id: String(g.id), name: g.name, icon: g.icon, approximate_member_count: null }));
  res.json({ user, guilds, access_token: 'dev' });
});

app.post('/api/auth/discord/callback', (req, res) => {
  const user = { id: '0', username: 'Dashboard Admin', global_name: 'Dashboard Admin', avatar: null };
  const guilds = client.guilds.cache.map(g => ({ id: String(g.id), name: g.name, icon: g.icon, approximate_member_count: null }));
  res.json({ user, guilds, access_token: 'dev' });
});

app.post('/api/auth/logout', (req, res) => res.json({ ok: true }));

function getGuildOr404(id, res) {
  const g = client.guilds.cache.get(String(id));
  if (!g) { res.status(404).end(); return null; }
  return g;
}

app.get('/api/guilds/:guild_id/stats', async (req, res) => {
  const g = getGuildOr404(req.params.guild_id, res); if (!g) return;
  try { await g.members.fetch(); } catch (_) {}
  const members = g.memberCount;
  let online = 0;
  g.members.cache.forEach(m => {
    const st = m.presence ? m.presence.status : null;
    if (st === 'online' || st === 'idle' || st === 'dnd') online += 1;
  });
  const channels = g.channels.cache.size;
  const commands = commandsUsed.get(String(g.id)) || 0;
  res.json({ members, online, channels, commands });
});

app.get('/api/guilds/:guild_id/settings', (req, res) => {
  const id = String(req.params.guild_id);
  let s = settingsStore[id];
  if (!s) { s = defaultSettings(); settingsStore[id] = s; saveSettings(); }
  res.json(s);
});

app.post('/api/guilds/:guild_id/settings', (req, res) => {
  const id = String(req.params.guild_id);
  settingsStore[id] = req.body;
  saveSettings();
  res.json({ ok: true });
});

app.get('/api/guilds/:guild_id/channels', (req, res) => {
  const g = getGuildOr404(req.params.guild_id, res); if (!g) return;
  const out = g.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => ({ id: String(c.id), name: c.name }));
  res.json(out);
});

app.get('/api/guilds/:guild_id/roles', (req, res) => {
  const g = getGuildOr404(req.params.guild_id, res); if (!g) return;
  const everyoneId = g.roles.everyone.id;
  const out = g.roles.cache.filter(r => r.id !== everyoneId).map(r => ({ id: String(r.id), name: r.name }));
  res.json(out);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const token = process.env.DISCORD_TOKEN;
if (!token) { console.error('DISCORD_TOKEN not set'); process.exit(1); }

app.listen(8000, () => console.log('http://localhost:8000/'));
client.login(token).catch(err => { console.error(err); process.exit(1); });
async function ensureMuteRole(guild) {
  const cfg = settingsStore[String(guild.id)] || defaultSettings();
  let roleId = cfg.moderation && cfg.moderation.mute_role_id || null;
  let role = roleId ? guild.roles.cache.get(String(roleId)) : null;
  if (!role) {
    role = guild.roles.cache.find(r=>r.name.toLowerCase()==='muted');
  }
  if (!role) {
    try { role = await guild.roles.create({ name: 'Muted', color: 0x808080, reason: 'Mute role' }); } catch (_) { return null; }
  }
  cfg.moderation = cfg.moderation || {};
  cfg.moderation.mute_role_id = role.id;
  settingsStore[String(guild.id)] = cfg;
  saveSettings();
  return role.id;
}
