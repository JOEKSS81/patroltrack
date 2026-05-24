import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__),'../.env'))
from telethon import TelegramClient, events
from extractor import extract_patrol_info
from database import insert_detection, init_db

API_ID   = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
GROUPS   = [g.strip() for g in os.environ.get("TELEGRAM_GROUPS","").split(",") if g.strip()]

client = TelegramClient("patroltrack_session", API_ID, API_HASH)

@client.on(events.NewMessage(chats=GROUPS or None))
async def on_message(event):
    message = event.message.message
    if not message or len(message.strip())<5: return
    group_name=""
    try:
        chat = await event.get_chat()
        group_name = getattr(chat,"title","") or getattr(chat,"username","")
    except: pass
    print(f"[TG] {group_name}: {message[:80]}")
    result = extract_patrol_info(message, source="telegram")
    if result:
        result["group_name"]=group_name
        result["raw_message"]=message
        new_id = insert_detection(result)
        print(f"  Desat ID={new_id} | {result['patrol_type']} a {result['zone_norm']} ({result['confidence']})")
    else:
        print("  No rellevant")

async def main():
    init_db()
    await client.start()
    me = await client.get_me()
    print(f"Connectat com: {me.first_name}")
    print(f"Escoltant {len(GROUPS)} grups..." if GROUPS else "Escoltant tots els chats...")
    await client.run_until_disconnected()

if __name__=="__main__":
    asyncio.run(main())
