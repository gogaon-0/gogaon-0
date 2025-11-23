async function fetchJSON(url, opts){
  const r = await fetch(url, opts);
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function loadStats(){
  try{
    const s = await fetchJSON('/api/stats');
    document.getElementById('mGuilds').textContent = s.guilds;
    document.getElementById('mChannels').textContent = s.channels;
    document.getElementById('mMembers').textContent = s.members;
    document.getElementById('mOnline').textContent = s.online;
  }catch(e){
    console.error(e);
  }
}

async function loadGuilds(){
  try{
    const g = await fetchJSON('/api/guilds');
    const list = document.getElementById('guildList');
    list.innerHTML = '';
    g.guilds.forEach(x=>{
      const li = document.createElement('li');
      li.textContent = `${x.name} (${x.id})`;
      list.appendChild(li);
    });
  }catch(e){
    console.error(e);
  }
}

async function sendAnn(){
  const cid = document.getElementById('channelId').value.trim();
  const msg = document.getElementById('announceMsg').value.trim();
  const st = document.getElementById('annStatus');
  st.textContent = '';
  if(!cid||!msg){
    st.textContent = '채널ID와 메시지를 입력하세요';
    return;
  }
  try{
    const r = await fetchJSON('/api/announce',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel_id:cid,message:msg})});
    st.textContent = r.ok?i18n[currentLang].ok:i18n[currentLang].fail;
  }catch(e){
    st.textContent = '오류: '+e.message;
  }
}

async function refreshBots(){
  try{
    const j = await fetchJSON('/api/bots');
    const ul = document.getElementById('botList');
    ul.innerHTML = '';
    j.bots.forEach(b=>{
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = '중지';
      btn.onclick = ()=>stopBot(b.id);
      li.textContent = `${b.name} (${b.prefix}) `;
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }catch(e){ console.error(e); }
}

async function startBot(){
  const name = document.getElementById('botName').value.trim();
  const prefix = document.getElementById('botPrefix').value.trim()||'!';
  const token = document.getElementById('botToken').value.trim();
  if(!token){ return; }
  try{
    await fetchJSON('/api/bot/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name, prefix, token})});
    document.getElementById('botToken').value='';
    await refreshBots();
  }catch(e){ console.error(e); }
}

async function stopBot(id){
  try{
    await fetchJSON('/api/bot/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
    await refreshBots();
  }catch(e){ console.error(e); }
}

document.getElementById('btnRefresh').addEventListener('click',()=>{loadStats();loadGuilds();});
document.getElementById('btnOpen').addEventListener('click',()=>{window.open(baseUrl, '_self');});
document.getElementById('btnAnn').addEventListener('click',sendAnn);
document.getElementById('langSelect').addEventListener('change',async (e)=>{
  currentLang = e.target.value;
  localStorage.setItem('lang', currentLang);
  applyLangText();
  try{
    await fetch('/api/lang',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lang:currentLang})});
  }catch(_){}
});
document.getElementById('btnBotStart').addEventListener('click',startBot);

Promise.all([loadLang(), loadBase()]).then(()=>{loadStats();loadGuilds();refreshBots();});
const i18n = {
  ko: {
    title: '디스코드 봇 대시보드',
    status: '상태',
    guilds: '길드 목록',
    announce: '공지 보내기',
    refresh: '새로고침',
    open: '대시보드 열기',
    channelId: '채널 ID',
    message: '메시지',
    send: '보내기',
    ok: '전송 완료',
    fail: '실패',
    need: '채널ID와 메시지를 입력하세요'
  },
  en: {
    title: 'Discord Bot Dashboard',
    status: 'Status',
    guilds: 'Guilds',
    announce: 'Send Announcement',
    refresh: 'Refresh',
    open: 'Open Dashboard',
    channelId: 'Channel ID',
    message: 'Message',
    send: 'Send',
    ok: 'Sent',
    fail: 'Failed',
    need: 'Enter channel ID and message'
  }
};

let currentLang = 'ko';
let baseUrl = '/';

function applyLangText(){
  const t = i18n[currentLang];
  document.getElementById('tTitle').textContent = t.title;
  document.getElementById('tStatus').textContent = t.status;
  document.getElementById('tGuilds').textContent = t.guilds;
  document.getElementById('tAnn').textContent = t.announce;
  document.getElementById('btnRefresh').textContent = t.refresh;
  document.getElementById('btnOpen').textContent = t.open;
  document.getElementById('channelId').placeholder = t.channelId;
  document.getElementById('announceMsg').placeholder = t.message;
  document.getElementById('btnAnn').textContent = t.send;
}

async function loadLang(){
  try{
    const r = await fetch('/api/lang');
    if(r.ok){
      const j = await r.json();
      currentLang = j.lang || 'ko';
    } else {
      const saved = localStorage.getItem('lang');
      if(saved) currentLang = saved;
    }
  }catch(e){
    const saved = localStorage.getItem('lang');
    if(saved) currentLang = saved;
  }
  document.getElementById('langSelect').value = currentLang;
  applyLangText();
}

async function loadBase(){
  try{
    const r = await fetch('/api/base');
    if(r.ok){
      const j = await r.json();
      baseUrl = j.base || '/';
    }
  }catch(_){ }

}