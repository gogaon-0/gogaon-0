// server.js - Discord OAuth2 백엔드
// npm install express cors dotenv axios express-session

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const session = require('express-session');

const app = express();

// ============================================
// 설정
// ============================================
const CONFIG = {
    CLIENT_ID: process.env.DISCORD_CLIENT_ID || '1441975322525434060',
    CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET, // .env에 설정 필수!
    REDIRECT_URI: 'https://plugmarket.r-e.kr/',
    API_BASE: 'https://discord.com/api/v10',
    FRONTEND_URL: 'https://plugmarket.r-e.kr'
};

// ============================================
// 미들웨어
// ============================================
app.use(express.json());
app.use(cors({
    origin: CONFIG.FRONTEND_URL,
    credentials: true
}));
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true, // HTTPS 필수
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7일
    }
}));

// ============================================
// Discord API 헬퍼
// ============================================
async function discordRequest(endpoint, accessToken) {
    const res = await axios.get(`${CONFIG.API_BASE}${endpoint}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    return res.data;
}

async function exchangeCodeForToken(code) {
    const params = new URLSearchParams({
        client_id: CONFIG.CLIENT_ID,
        client_secret: CONFIG.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: CONFIG.REDIRECT_URI
    });

    const res = await axios.post(`${CONFIG.API_BASE}/oauth2/token`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return res.data;
}

// ============================================
// 라우트
// ============================================

// OAuth2 콜백 - code를 토큰으로 교환
app.post('/api/auth/discord/callback', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'Code is required' });
    }

    try {
        // 1. code를 access_token으로 교환
        const tokenData = await exchangeCodeForToken(code);
        const accessToken = tokenData.access_token;

        // 2. 사용자 정보 가져오기
        const user = await discordRequest('/users/@me', accessToken);

        // 3. 사용자의 서버 목록 가져오기
        const guilds = await discordRequest('/users/@me/guilds', accessToken);

        // 4. 세션에 저장
        req.session.accessToken = accessToken;
        req.session.refreshToken = tokenData.refresh_token;
        req.session.user = user;
        req.session.guilds = guilds;

        res.json({
            access_token: accessToken,
            user,
            guilds
        });

    } catch (err) {
        console.error('OAuth Error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// 현재 세션 확인
app.get('/api/auth/session', (req, res) => {
    if (req.session.user) {
        res.json({
            access_token: req.session.accessToken,
            user: req.session.user,
            guilds: req.session.guilds
        });
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

// 로그아웃
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// 사용자 정보
app.get('/api/user', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json(req.session.user);
});

// 서버 목록
app.get('/api/guilds', (req, res) => {
    if (!req.session.guilds) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json(req.session.guilds);
});

// 서버 통계 (봇에서 데이터 가져와야 함)
app.get('/api/guilds/:guildId/stats', async (req, res) => {
    const { guildId } = req.params;
    
    // TODO: 실제로는 봇 API나 데이터베이스에서 통계 가져오기
    // 예시 더미 데이터
    res.json({
        members: 1234,
        online: 456,
        channels: 32,
        commands: 156
    });
});

// 서버 설정 저장
app.post('/api/guilds/:guildId/settings', (req, res) => {
    const { guildId } = req.params;
    const settings = req.body;

    // TODO: 데이터베이스에 설정 저장
    console.log(`Saving settings for guild ${guildId}:`, settings);

    res.json({ success: true });
});

// ============================================
// 서버 시작
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
