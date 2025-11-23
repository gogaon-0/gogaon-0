// ============================================
// 설정
// ============================================
const CONFIG = {
    CLIENT_ID: '1441975322525434060',
    REDIRECT_URI: window.location.origin + '/',
    API_URL: '/api',
    OAUTH_URL: 'https://discord.com/oauth2/authorize'
};

// 상태 관리
let accessToken = null;
let currentUser = null;
let userGuilds = [];
let currentGuild = null;
let currentSettings = null;
let chart1 = null;
let chart2 = null;

// ============================================
// 초기화
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    initEventListeners();
});

async function initApp() {
    const code = getCodeFromUrl();

    if (code) {
        window.history.replaceState({}, '', CONFIG.REDIRECT_URI);
        
        try {
            showLoading('로그인 중...');
            const data = await exchangeCode(code);
            
            accessToken = data.access_token;
            currentUser = data.user;
            userGuilds = data.guilds || [];
            
            renderUserInfo();
            renderServerGrid();
            showPage('serverSelectPage');
        } catch (err) {
            console.error('Auth error:', err);
            showError('로그인에 실패했습니다. 다시 시도해주세요.');
            showPage('loginPage');
        }
    } else {
        try {
            const session = await api('/auth/session');
            if (session && session.user) {
                accessToken = session.access_token;
                currentUser = session.user;
                userGuilds = session.guilds || [];
                
                renderUserInfo();
                renderServerGrid();
                showPage('serverSelectPage');
            } else {
                showPage('loginPage');
            }
        } catch (e) {
            showPage('loginPage');
        }
    }
}

// ============================================
// 이벤트 리스너
// ============================================
function initEventListeners() {
    // 메뉴 아이템 클릭
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', function() {
            const section = this.dataset.section;
            switchSection(section);
        });
    });
}

// ============================================
// OAuth 로그인
// ============================================
function loginWithDiscord() {
    const params = new URLSearchParams({
        client_id: CONFIG.CLIENT_ID,
        redirect_uri: CONFIG.REDIRECT_URI,
        response_type: 'code',
        scope: 'identify guilds',
        integration_type: '0'
    });
    window.location.href = `${CONFIG.OAUTH_URL}?${params}`;
}

function getCodeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('code');
}

async function exchangeCode(code) {
    const res = await fetch(`${CONFIG.API_URL}/auth/discord/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        credentials: 'include'
    });
    
    if (!res.ok) throw new Error('Token exchange failed');
    return res.json();
}

// ============================================
// API 호출
// ============================================
async function api(endpoint, options = {}) {
    const res = await fetch(`${CONFIG.API_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            ...options.headers
        },
        credentials: 'include'
    });
    
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
}

// ============================================
// UI 헬퍼 함수
// ============================================
function showPage(pageId) {
    ['loginPage', 'serverSelectPage', 'dashboardPage'].forEach(id => {
        const el = document.getElementById(id);
        if (id === pageId) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });
}

function showError(msg) {
    const el = document.getElementById('loginError');
    el.textContent = msg;
    el.classList.remove('hidden');
}

function showLoading(msg) {
    console.log('Loading:', msg);
}

function getAvatarUrl(user) {
    if (user.avatar) {
        return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
    }
    const index = (BigInt(user.id) >> 22n) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function getGuildIconUrl(guild) {
    if (guild.icon) {
        return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
    }
    return null;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================
// 렌더링 함수
// ============================================
function renderUserInfo() {
    document.getElementById('userName').textContent = 
        currentUser.global_name || currentUser.username;
    document.getElementById('userAvatar').innerHTML = 
        `<img src="${getAvatarUrl(currentUser)}" alt="Avatar">`;
}

function renderServerGrid() {
    const grid = document.getElementById('serverGrid');
    
    if (userGuilds.length === 0) {
        grid.innerHTML = '<p style="color:#b9bbbe;text-align:center;grid-column:1/-1;">관리자 권한이 있는 서버가 없습니다.</p>';
        return;
    }

    grid.innerHTML = userGuilds.map(g => {
        const iconUrl = getGuildIconUrl(g);
        const iconHtml = iconUrl 
            ? `<img src="${iconUrl}" alt="">`
            : g.name.charAt(0).toUpperCase();
        
        return `
            <div class="server-card" onclick="selectGuild('${g.id}')">
                <div class="server-header">
                    <div class="server-icon">${iconHtml}</div>
                    <div class="server-info">
                        <h3>${escapeHtml(g.name)}</h3>
                        <div class="online-badge">
                            <div class="online-dot"></div>
                            <span>봇 활성</span>
                        </div>
                    </div>
                </div>
                <div class="server-footer">
                    <span>${g.approximate_member_count || '-'} 멤버</span>
                    <span class="bot-status">관리</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// 서버 선택
// ============================================
async function selectGuild(guildId) {
    currentGuild = userGuilds.find(g => g.id === guildId);
    if (!currentGuild) return;

    showPage('dashboardPage');

    const iconUrl = getGuildIconUrl(currentGuild);
    const iconEl = document.getElementById('selectedServerIcon');
    iconEl.innerHTML = iconUrl 
        ? `<img src="${iconUrl}" alt="">` 
        : currentGuild.name.charAt(0).toUpperCase();

    document.getElementById('selectedServerName').textContent = currentGuild.name;
    document.getElementById('selectedServerMembers').textContent = 
        (currentGuild.approximate_member_count || '-') + ' 멤버';

    await loadGuildData(guildId);
}

async function loadGuildData(guildId) {
    try {
        // 통계 로드
        const stats = await api(`/guilds/${guildId}/stats`);
        document.getElementById('totalMembers').textContent = stats.members || '-';
        document.getElementById('onlineMembers').textContent = stats.online || '-';
        document.getElementById('totalChannels').textContent = stats.channels || '-';
        document.getElementById('totalCommands').textContent = stats.commands || '-';

        // 설정 로드
        currentSettings = await api(`/guilds/${guildId}/settings`);
        applySettings();

        // 채널 및 역할 로드
        await loadChannelsAndRoles(guildId);

        // 차트 렌더링
        renderCharts();
    } catch (e) {
        console.error('Failed to load guild data:', e);
        
        // 더미 데이터
        document.getElementById('totalMembers').textContent = currentGuild.approximate_member_count || '-';
        document.getElementById('onlineMembers').textContent = '-';
        document.getElementById('totalChannels').textContent = '-';
        document.getElementById('totalCommands').textContent = '-';
        
        renderCharts();
    }
}

async function loadChannelsAndRoles(guildId) {
    try {
        // 채널 로드
        const channels = await api(`/guilds/${guildId}/channels`);
        const welcomeSelect = document.getElementById('welcomeChannel');
        const logSelect = document.getElementById('logChannel');
        
        const channelOptions = channels.map(ch => 
            `<option value="${ch.id}">${ch.name}</option>`
        ).join('');
        
        welcomeSelect.innerHTML = '<option value="">채널을 선택하세요</option>' + channelOptions;
        logSelect.innerHTML = '<option value="">채널을 선택하세요</option>' + channelOptions;

        // 역할 로드
        const roles = await api(`/guilds/${guildId}/roles`);
        const djSelect = document.getElementById('djRole');
        
        const roleOptions = roles.map(role => 
            `<option value="${role.id}">${role.name}</option>`
        ).join('');
        
        djSelect.innerHTML = '<option value="">역할을 선택하세요</option>' + roleOptions;
    } catch (e) {
        console.error('Failed to load channels/roles:', e);
    }
}

// ============================================
// 설정 적용
// ============================================
function applySettings() {
    if (!currentSettings) return;

    // 환영 메시지 설정
    const welcomeToggle = document.getElementById('welcomeToggle');
    if (currentSettings.welcome.enabled) {
        welcomeToggle.classList.add('active');
    } else {
        welcomeToggle.classList.remove('active');
    }
    
    if (currentSettings.welcome.channel_id) {
        document.getElementById('welcomeChannel').value = currentSettings.welcome.channel_id;
    }
    
    document.getElementById('welcomeMessage').value = currentSettings.welcome.message;

    // 모더레이션 설정
    const autoModToggle = document.getElementById('autoModToggle');
    if (currentSettings.moderation.auto_mod) {
        autoModToggle.classList.add('active');
    } else {
        autoModToggle.classList.remove('active');
    }
    
    if (currentSettings.moderation.log_channel_id) {
        document.getElementById('logChannel').value = currentSettings.moderation.log_channel_id;
    }

    // 음악 설정
    const volumeSlider = document.getElementById('volumeSlider');
    volumeSlider.value = currentSettings.music.volume;
    document.getElementById('volumeValue').textContent = currentSettings.music.volume + '%';
    
    if (currentSettings.music.dj_role_id) {
        document.getElementById('djRole').value = currentSettings.music.dj_role_id;
    }
}

// ============================================
// 설정 저장
// ============================================
async function saveWelcomeSettings() {
    if (!currentGuild || !currentSettings) return;

    const welcomeToggle = document.getElementById('welcomeToggle');
    const channelId = document.getElementById('welcomeChannel').value;
    const message = document.getElementById('welcomeMessage').value;

    currentSettings.welcome = {
        enabled: welcomeToggle.classList.contains('active'),
        channel_id: channelId || null,
        message: message
    };

    try {
        await api(`/guilds/${currentGuild.id}/settings`, {
            method: 'POST',
            body: JSON.stringify(currentSettings)
        });
        
        alert('✅ 환영 메시지 설정이 저장되었습니다!');
    } catch (e) {
        console.error('Failed to save settings:', e);
        alert('❌ 설정 저장에 실패했습니다.');
    }
}

async function saveModerationSettings() {
    if (!currentGuild || !currentSettings) return;

    const autoModToggle = document.getElementById('autoModToggle');
    const logChannelId = document.getElementById('logChannel').value;

    currentSettings.moderation = {
        enabled: true,
        log_channel_id: logChannelId || null,
        auto_mod: autoModToggle.classList.contains('active')
    };

    try {
        await api(`/guilds/${currentGuild.id}/settings`, {
            method: 'POST',
            body: JSON.stringify(currentSettings)
        });
        
        alert('✅ 모더레이션 설정이 저장되었습니다!');
    } catch (e) {
        console.error('Failed to save settings:', e);
        alert('❌ 설정 저장에 실패했습니다.');
    }
}

async function saveMusicSettings() {
    if (!currentGuild || !currentSettings) return;

    const volume = document.getElementById('volumeSlider').value;
    const djRoleId = document.getElementById('djRole').value;

    currentSettings.music = {
        volume: parseInt(volume),
        dj_role_id: djRoleId || null
    };

    try {
        await api(`/guilds/${currentGuild.id}/settings`, {
            method: 'POST',
            body: JSON.stringify(currentSettings)
        });
        
        alert('✅ 음악 설정이 저장되었습니다!');
    } catch (e) {
        console.error('Failed to save settings:', e);
        alert('❌ 설정 저장에 실패했습니다.');
    }
}

// ============================================
// UI 인터랙션
// ============================================
function toggleSwitch(el) {
    el.classList.toggle('active');
}

function updateSlider(el) {
    document.getElementById('volumeValue').textContent = el.value + '%';
}

function switchSection(section) {
    document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    
    const sectionId = 'section' + section.charAt(0).toUpperCase() + section.slice(1);
    document.getElementById(sectionId).classList.add('active');
    
    document.querySelector(`[data-section="${section}"]`).classList.add('active');
}

function goBackToServerSelect() {
    currentGuild = null;
    currentSettings = null;
    showPage('serverSelectPage');
}

function doLogout() {
    accessToken = null;
    currentUser = null;
    userGuilds = [];
    currentGuild = null;
    currentSettings = null;
    
    fetch(`${CONFIG.API_URL}/auth/logout`, { 
        method: 'POST', 
        credentials: 'include' 
    }).catch(() => {});
    
    window.history.replaceState({}, '', CONFIG.REDIRECT_URI);
    showPage('loginPage');
}

// ============================================
// 차트 렌더링
// ============================================
function renderCharts() {
    if (chart1) chart1.destroy();
    if (chart2) chart2.destroy();

    const ctx1 = document.getElementById('chart1');
    const ctx2 = document.getElementById('chart2');

    // 일별 메시지 차트
    chart1 = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: ['월', '화', '수', '목', '금', '토', '일'],
            datasets: [{
                label: '메시지',
                data: [2400, 1398, 9800, 3908, 4800, 3800, 4300],
                backgroundColor: '#5865F2',
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#b9bbbe' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#b9bbbe' }
                }
            }
        }
    });

    // 멤버 추이 차트
    chart2 = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: ['월', '화', '수', '목', '금', '토', '일'],
            datasets: [{
                label: '멤버',
                data: [120, 135, 150, 148, 165, 170, 175],
                borderColor: '#43b581',
                backgroundColor: 'rgba(67, 181, 129, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#b9bbbe' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#b9bbbe' }
                }
            }
        }
    });
}
