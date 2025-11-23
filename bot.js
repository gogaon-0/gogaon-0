// bot.js - Discord 봇
// npm install discord.js dotenv

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// API에서 서버 설정 가져오기
const API_URL = process.env.API_URL || 'https://your-worker.workers.dev';

async function getGuildSettings(guildId) {
    try {
        const res = await fetch(`${API_URL}/api/guilds/${guildId}/settings`);
        if (!res.ok) return null;
        return res.json();
    } catch (e) {
        console.error('설정 로드 실패:', e);
        return null;
    }
}

// 봇 준비 완료
client.once('ready', () => {
    console.log(`✅ 봇 로그인: ${client.user.tag}`);
    console.log(`📊 ${client.guilds.cache.size}개 서버에서 활동 중`);
});

// ============================================
// 환영 메시지
// ============================================
client.on('guildMemberAdd', async (member) => {
    const settings = await getGuildSettings(member.guild.id);
    if (!settings?.welcome?.enabled) return;

    const channel = member.guild.channels.cache.get(settings.welcome.channelId);
    if (!channel) return;

    // 메시지 변수 치환
    let message = settings.welcome.message || '{user}님, 환영합니다!';
    message = message
        .replace(/{user}/g, member.toString())
        .replace(/{username}/g, member.user.username)
        .replace(/{server}/g, member.guild.name)
        .replace(/{membercount}/g, member.guild.memberCount);

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('👋 새 멤버 입장!')
        .setDescription(message)
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

    channel.send({ embeds: [embed] });
});

// ============================================
// 자동 모더레이션
// ============================================
const spamMap = new Map(); // 스팸 감지용

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;

    const settings = await getGuildSettings(msg.guild?.id);
    if (!settings?.moderation?.enabled) return;

    // 스팸 감지 (5초 내 5개 이상 메시지)
    const key = `${msg.guild.id}-${msg.author.id}`;
    const now = Date.now();
    const userMsgs = spamMap.get(key) || [];
    userMsgs.push(now);
    
    // 5초 이내 메시지만 유지
    const recent = userMsgs.filter(t => now - t < 5000);
    spamMap.set(key, recent);

    if (recent.length >= 5) {
        // 스팸 감지됨
        try {
            await msg.delete();
            await msg.channel.send({
                content: `⚠️ ${msg.author}, 스팸이 감지되었습니다. 천천히 보내주세요.`,
            }).then(m => setTimeout(() => m.delete(), 5000));

            // 로그 채널에 기록
            if (settings.moderation.logChannelId) {
                const logChannel = msg.guild.channels.cache.get(settings.moderation.logChannelId);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#ED4245')
                        .setTitle('🛡️ 스팸 감지')
                        .addFields(
                            { name: '사용자', value: msg.author.toString(), inline: true },
                            { name: '채널', value: msg.channel.toString(), inline: true }
                        )
                        .setTimestamp();
                    logChannel.send({ embeds: [logEmbed] });
                }
            }

            spamMap.set(key, []); // 리셋
        } catch (e) {
            console.error('모더레이션 오류:', e);
        }
    }

    // 욕설 필터 (간단 예시)
    const badWords = settings.moderation.badWords || [];
    const hasBadWord = badWords.some(w => 
        msg.content.toLowerCase().includes(w.toLowerCase())
    );

    if (hasBadWord) {
        try {
            await msg.delete();
            await msg.channel.send({
                content: `⚠️ ${msg.author}, 부적절한 언어가 감지되었습니다.`
            }).then(m => setTimeout(() => m.delete(), 5000));
        } catch (e) {
            console.error('욕설 필터 오류:', e);
        }
    }
});

// ============================================
// 음악 기능 (기본)
// ============================================
const queues = new Map();

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;

    const args = msg.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    const settings = await getGuildSettings(msg.guild?.id);
    const volume = settings?.music?.volume || 75;
    const djRoleId = settings?.music?.djRoleId;

    // DJ 역할 체크
    if (djRoleId && !msg.member.roles.cache.has(djRoleId)) {
        if (['play', 'skip', 'stop', 'volume'].includes(cmd)) {
            return msg.reply('🎵 DJ 역할이 필요합니다!');
        }
    }

    if (cmd === 'play') {
        if (!msg.member.voice.channel) {
            return msg.reply('🎵 음성 채널에 먼저 입장해주세요!');
        }
        msg.reply(`🎵 음악 기능은 추가 라이브러리가 필요합니다. (기본 볼륨: ${volume}%)`);
    }

    if (cmd === 'volume') {
        msg.reply(`🔊 현재 볼륨: ${volume}%`);
    }
});

// 봇 로그인
client.login(process.env.MTQ0MTk3NTMyMjUyNTQzNDA2MA.G_D0N-.HUVauDyexOdENPUA78uVLrfT4bzn0681YxRcsw);
