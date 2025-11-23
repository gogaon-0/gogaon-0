import os
import asyncio
import json
from aiohttp import web
import discord
from discord.ext import commands
from discord import app_commands

PORT = int(os.environ.get("DASHBOARD_PORT", "8000"))
DISABLE_PRIV = os.environ.get("DISABLE_PRIVILEGED_INTENTS", "0") == "1"
BASE_URL = os.environ.get("DASHBOARD_BASE", f"http://localhost:{PORT}/")

intents = discord.Intents.none()
intents.guilds = True
intents.guild_messages = True
intents.message_content = not DISABLE_PRIV
intents.members = not DISABLE_PRIV

bot = commands.Bot(command_prefix="!", intents=intents)
LANG = "ko"
BOT_INSTANCES: dict[str, dict] = {}

async def api_stats(request):
    guild_count = len(bot.guilds)
    channel_count = sum(len(g.channels) for g in bot.guilds)
    member_count = 0
    online_count = 0
    for g in bot.guilds:
        try:
            member_count += g.member_count or 0
        except Exception:
            pass
        try:
            online_count += sum(1 for m in g.members if m.status and str(m.status) != "offline")
        except Exception:
            pass
    return web.json_response({
        "guilds": guild_count,
        "channels": channel_count,
        "members": member_count,
        "online": online_count
    })

async def api_guilds(request):
    data = [{"id": str(g.id), "name": g.name} for g in bot.guilds]
    return web.json_response({"guilds": data})

async def api_commands(request):
    cmds = [
        {"name": "핑", "type": "slash"},
        {"name": "대시보드", "type": "slash"},
        {"name": "공지", "type": "slash"},
        {"name": "서버정보", "type": "slash"},
        {"name": "유저정보", "type": "slash"}
    ]
    return web.json_response({"commands": cmds})

async def api_announce(request):
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    channel_id = str(payload.get("channel_id", ""))
    message = str(payload.get("message", ""))
    if not channel_id or not message:
        return web.json_response({"ok": False, "error": "missing_params"}, status=400)
    channel = bot.get_channel(int(channel_id))
    if channel is None:
        return web.json_response({"ok": False, "error": "channel_not_found"}, status=404)
    try:
        await channel.send(message)
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)

async def api_lang_get(request):
    return web.json_response({"lang": LANG})

async def api_lang_set(request):
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    value = str(payload.get("lang", "")).lower()
    if value not in ("ko", "en"):
        return web.json_response({"ok": False}, status=400)
    global LANG
    LANG = value
    return web.json_response({"ok": True, "lang": LANG})

async def index_handler(request):
    return web.FileResponse(path=os.path.join(os.getcwd(), "index.html"))

def create_app():
    app = web.Application()
    app.router.add_get("/", index_handler)
    app.router.add_get("/api/stats", api_stats)
    app.router.add_get("/api/guilds", api_guilds)
    app.router.add_get("/api/commands", api_commands)
    app.router.add_post("/api/announce", api_announce)
    app.router.add_get("/api/lang", api_lang_get)
    app.router.add_post("/api/lang", api_lang_set)
    async def api_base(request):
        return web.json_response({"base": BASE_URL})
    app.router.add_get("/api/base", api_base)
    async def api_bots(request):
        items = []
        for bid, info in BOT_INSTANCES.items():
            items.append({"id": bid, "name": info.get("name", ""), "prefix": info.get("prefix", "!")})
        return web.json_response({"bots": items})
    async def api_bot_start(request):
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        name = str(payload.get("name", "")).strip() or "bot"
        token = str(payload.get("token", "")).strip()
        prefix = str(payload.get("prefix", "!")).strip() or "!"
        if not token:
            return web.json_response({"ok": False}, status=400)
        bid = await start_additional_bot(name, token, prefix)
        return web.json_response({"ok": True, "id": bid})
    async def api_bot_stop(request):
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        bid = str(payload.get("id", "")).strip()
        if not bid or bid not in BOT_INSTANCES:
            return web.json_response({"ok": False}, status=404)
        await stop_additional_bot(bid)
        return web.json_response({"ok": True})
    app.router.add_get("/api/bots", api_bots)
    app.router.add_post("/api/bot/start", api_bot_start)
    app.router.add_post("/api/bot/stop", api_bot_stop)
    static_dir = os.path.join(os.getcwd(), "static")
    if not os.path.isdir(static_dir):
        os.makedirs(static_dir, exist_ok=True)
    app.router.add_static("/static/", static_dir, show_index=False)
    return app

@bot.tree.command(name="핑")
async def cmd_ping(interaction: discord.Interaction):
    await interaction.response.send_message("퐁", ephemeral=True)

@bot.tree.command(name="대시보드")
async def cmd_dashboard(interaction: discord.Interaction):
    await interaction.response.send_message(BASE_URL, ephemeral=True)

@bot.tree.command(name="공지")
@app_commands.describe(채널="보낼 채널", 내용="메시지")
async def cmd_announce(interaction: discord.Interaction, 채널: discord.TextChannel, 내용: str):
    try:
        await 채널.send(내용)
        await interaction.response.send_message("전송 완료", ephemeral=True)
    except Exception as e:
        await interaction.response.send_message("오류", ephemeral=True)

@bot.tree.command(name="서버정보")
async def cmd_server(interaction: discord.Interaction):
    g = interaction.guild
    if not g:
        await interaction.response.send_message("서버에서만 사용", ephemeral=True)
        return
    await interaction.response.send_message(f"서버: {g.name} • 멤버: {g.member_count}", ephemeral=True)

@bot.tree.command(name="유저정보")
@app_commands.describe(사용자="대상 유저")
async def cmd_user(interaction: discord.Interaction, 사용자: discord.Member | None = None):
    m = 사용자 or interaction.user
    await interaction.response.send_message(f"유저: {m.display_name} • ID: {m.id}", ephemeral=True)

@bot.tree.command(name="경고")
@app_commands.describe(사용자="대상 유저", 사유="사유")
async def cmd_warn(interaction: discord.Interaction, 사용자: discord.Member, 사유: str):
    if not interaction.user.guild_permissions.manage_messages:
        await interaction.response.send_message("권한 없음", ephemeral=True)
        return
    try:
        await 사용자.send(f"경고: {사유}")
    except Exception:
        pass
    await interaction.response.send_message("경고 처리", ephemeral=True)

@bot.tree.command(name="뮤트")
@app_commands.describe(사용자="대상 유저", 분="분")
async def cmd_mute(interaction: discord.Interaction, 사용자: discord.Member, 분: int):
    if not interaction.user.guild_permissions.moderate_members:
        await interaction.response.send_message("권한 없음", ephemeral=True)
        return
    try:
        await 사용자.timeout(discord.utils.utcnow() + discord.timedelta(minutes=max(1, 분)))
        await interaction.response.send_message("뮤트 처리", ephemeral=True)
    except Exception:
        await interaction.response.send_message("오류", ephemeral=True)

@bot.tree.command(name="언뮤트")
@app_commands.describe(사용자="대상 유저")
async def cmd_unmute(interaction: discord.Interaction, 사용자: discord.Member):
    if not interaction.user.guild_permissions.moderate_members:
        await interaction.response.send_message("권한 없음", ephemeral=True)
        return
    try:
        await 사용자.timeout(None)
        await interaction.response.send_message("언뮤트 처리", ephemeral=True)
    except Exception:
        await interaction.response.send_message("오류", ephemeral=True)

@bot.event
async def on_ready():
    try:
        await bot.tree.sync()
    except Exception:
        pass

async def main():
    token = os.environ.get("DISCORD_TOKEN", "")
    if not token:
        raise RuntimeError("DISCORD_TOKEN not set")
    app = create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    await bot.start(token)

def build_bot(prefix: str) -> commands.Bot:
    intents2 = discord.Intents.none()
    intents2.guilds = True
    intents2.guild_messages = True
    intents2.message_content = not DISABLE_PRIV
    intents2.members = not DISABLE_PRIV
    b = commands.Bot(command_prefix=prefix, intents=intents2)
    @b.tree.command(name="핑")
    async def _ping(interaction: discord.Interaction):
        await interaction.response.send_message("퐁", ephemeral=True)
    @b.tree.command(name="대시보드")
    async def _dash(interaction: discord.Interaction):
        await interaction.response.send_message(BASE_URL, ephemeral=True)
    @b.event
    async def on_ready():
        try:
            await b.tree.sync()
        except Exception:
            pass
    return b

async def start_additional_bot(name: str, token: str, prefix: str) -> str:
    b = build_bot(prefix)
    bid = f"bot-{len(BOT_INSTANCES)+1}"
    BOT_INSTANCES[bid] = {"name": name, "prefix": prefix, "bot": b}
    asyncio.create_task(b.start(token))
    return bid

async def stop_additional_bot(bid: str):
    info = BOT_INSTANCES.get(bid)
    if not info:
        return
    b: commands.Bot = info.get("bot")
    try:
        await b.close()
    except Exception:
        pass
    BOT_INSTANCES.pop(bid, None)

if __name__ == "__main__":
    asyncio.run(main())