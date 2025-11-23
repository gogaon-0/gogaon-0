const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB 연결 설정
const MONGODB_URI = 'mongodb+srv://ymellonbu_db_user:ng8WkHc9MTosQpfv@cluster0.xzuyypn.mongodb.net/';
const DB_NAME = 'discord_bot_dashboard';

let db;
let client;

// MongoDB 연결
async function connectDB() {
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ MongoDB 연결 성공!');
    
    // 컬렉션 생성 (없으면)
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    if (!collectionNames.includes('stats')) {
      await db.createCollection('stats');
      // 초기 데이터 삽입
      await db.collection('stats').insertOne({
        guilds: 12,
        channels: 248,
        members: 5432,
        online: 1876,
        lastUpdate: new Date()
      });
    }
    
    if (!collectionNames.includes('guilds')) {
      await db.createCollection('guilds');
      await db.collection('guilds').insertMany([
        { id: '1', name: '게임 커뮤니티', members: 1234, channels: 42, createdAt: new Date() },
        { id: '2', name: '개발자 모임', members: 856, channels: 28, createdAt: new Date() },
        { id: '3', name: '음악 감상방', members: 432, channels: 15, createdAt: new Date() }
      ]);
    }
    
    if (!collectionNames.includes('bots')) {
      await db.createCollection('bots');
      await db.collection('bots').insertMany([
        { id: '1', name: '메인 봇', prefix: '!', token: 'encrypted_token', status: 'online', createdAt: new Date() }
      ]);
    }
    
    if (!collectionNames.includes('activity_logs')) {
      await db.createCollection('activity_logs');
      await db.collection('activity_logs').insertOne({
        message: '시스템이 시작되었습니다.',
        timestamp: new Date()
      });
    }
    
  } catch (error) {
    console.error('❌ MongoDB 연결 실패:', error);
    process.exit(1);
  }
}

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // HTML, CSS, JS 파일 서빙

// ==================== API 라우트 ====================

// 1. 통계 조회
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.collection('stats').findOne({}, { sort: { lastUpdate: -1 } });
    res.json(stats || { guilds: 0, channels: 0, members: 0, online: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. 통계 업데이트
app.post('/api/stats', async (req, res) => {
  try {
    const { guilds, channels, members, online } = req.body;
    const result = await db.collection('stats').updateOne(
      {},
      { 
        $set: { 
          guilds: guilds || 0, 
          channels: channels || 0, 
          members: members || 0, 
          online: online || 0,
          lastUpdate: new Date()
        } 
      },
      { upsert: true }
    );
    
    // 활동 로그 추가
    await db.collection('activity_logs').insertOne({
      message: '📊 통계가 업데이트되었습니다.',
      timestamp: new Date()
    });
    
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. 길드 목록 조회
app.get('/api/guilds', async (req, res) => {
  try {
    const guilds = await db.collection('guilds').find({}).toArray();
    res.json(guilds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. 길드 추가
app.post('/api/guilds', async (req, res) => {
  try {
    const { id, name, members, channels } = req.body;
    const guild = {
      id: id || Date.now().toString(),
      name,
      members: members || 0,
      channels: channels || 0,
      createdAt: new Date()
    };
    
    await db.collection('guilds').insertOne(guild);
    
    // 활동 로그 추가
    await db.collection('activity_logs').insertOne({
      message: `🏰 길드 "${name}"이(가) 추가되었습니다.`,
      timestamp: new Date()
    });
    
    res.json({ success: true, guild });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. 길드 삭제
app.delete('/api/guilds/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const guild = await db.collection('guilds').findOne({ id });
    await db.collection('guilds').deleteOne({ id });
    
    // 활동 로그 추가
    await db.collection('activity_logs').insertOne({
      message: `🗑️ 길드 "${guild?.name || id}"이(가) 삭제되었습니다.`,
      timestamp: new Date()
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. 봇 목록 조회
app.get('/api/bots', async (req, res) => {
  try {
    const bots = await db.collection('bots').find({}).toArray();
    // 토큰은 보안상 제외
    const sanitizedBots = bots.map(bot => ({
      id: bot.id,
      name: bot.name,
      prefix: bot.prefix,
      status: bot.status,
      createdAt: bot.createdAt
    }));
    res.json(sanitizedBots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. 봇 추가
app.post('/api/bots', async (req, res) => {
  try {
    const { name, prefix, token } = req.body;
    const bot = {
      id: Date.now().toString(),
      name,
      prefix: prefix || '!',
      token, // 실제로는 암호화 필요
      status: 'online',
      createdAt: new Date()
    };
    
    await db.collection('bots').insertOne(bot);
    
    // 활동 로그 추가
    await db.collection('activity_logs').insertOne({
      message: `🤖 봇 "${name}"이(가) 추가되었습니다.`,
      timestamp: new Date()
    });
    
    // 토큰 제외하고 반환
    delete bot.token;
    res.json({ success: true, bot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. 봇 삭제
app.delete('/api/bots/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const bot = await db.collection('bots').findOne({ id });
    await db.collection('bots').deleteOne({ id });
    
    // 활동 로그 추가
    await db.collection('activity_logs').insertOne({
      message: `🗑️ 봇 "${bot?.name || id}"이(가) 삭제되었습니다.`,
      timestamp: new Date()
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. 봇 상태 업데이트
app.patch('/api/bots/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    await db.collection('bots').updateOne(
      { id },
      { $set: { status, lastUpdate: new Date() } }
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. 메시지 전송 (로그만 저장)
app.post('/api/message', async (req, res) => {
  try {
    const { channelId, message, type } = req.body;
    
    // 메시지 로그 저장
    await db.collection('message_logs').insertOne({
      channelId,
      message,
      type: type || 'text',
      timestamp: new Date()
    });
    
    // 활동 로그 추가
    await db.collection('activity_logs').insertOne({
      message: `📨 채널 ${channelId}에 메시지를 전송했습니다.`,
      timestamp: new Date()
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 11. 활동 로그 조회
app.get('/api/activity-logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = await db.collection('activity_logs')
      .find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12. 베이스 정보 (언어 등)
app.get('/api/base', async (req, res) => {
  res.json({
    version: '1.0.0',
    name: 'Discord Bot Dashboard',
    supportedLanguages: ['ko', 'en']
  });
});

// 13. 언어 데이터
app.get('/api/lang', async (req, res) => {
  res.json({
    ko: {
      title: '디스코드 봇 대시보드',
      status: '실시간 상태',
      bots: '봇 관리',
      guilds: '길드 목록',
      announcement: '메시지 보내기'
    },
    en: {
      title: 'Discord Bot Dashboard',
      status: 'Live Status',
      bots: 'Bot Management',
      guilds: 'Guild List',
      announcement: 'Send Message'
    }
  });
});

// 루트 경로
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 서버 시작
async function startServer() {
  await connectDB();
  
  app.listen(PORT, () => {
    console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`📱 브라우저에서 http://localhost:${PORT} 접속하세요!`);
  });
}

// 서버 종료 시 DB 연결 해제
process.on('SIGINT', async () => {
  console.log('\n서버를 종료합니다...');
  if (client) {
    await client.close();
    console.log('MongoDB 연결이 종료되었습니다.');
  }
  process.exit(0);
});

startServer();
