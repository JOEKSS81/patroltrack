# PatrolTrack — Cloudflare

Backend en Cloudflare Workers + D1. Telegram se conecta mediante un bot y un webhook; WhatsApp no ofrece aquí acceso directo al contenido de grupos, así que las opciones son reportar manualmente o usar Tasker/AutoNotification para enviar únicamente el texto visible en notificaciones autorizadas.

## Configuración inicial

```bash
cd cloudflare
npm install
npx wrangler login
npx wrangler d1 create patroltrack
```

Configura el `database_id` de la base creada en `wrangler.toml`, ejecuta el esquema (`npm run db:schema`) y define los secretos:

```bash
npx wrangler secret put INGEST_TOKEN
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
# Opcional si Pages usa un dominio distinto de https://patroltrack.pages.dev
npx wrangler secret put APP_ORIGIN
npm run deploy
```

El secreto `TELEGRAM_WEBHOOK_SECRET` debe tener entre 1 y 256 caracteres, usar solo letras/números/`_`/`-`, y configurarse igual en el Worker y en el webhook. Mantén los tokens fuera del código y del historial Git.

## Telegram

1. Añade el bot al grupo y comprueba la configuración de privacidad del bot en BotFather. Con privacidad activada, Telegram normalmente solo entrega comandos y mensajes dirigidos al bot; para recibir mensajes corrientes del grupo, desactiva Privacy Mode o configura el bot como administrador según las necesidades del grupo.
2. Tras desplegar y aplicar el esquema, abre la pestaña Configuración → **Estado Telegram** → **Reparar**. El endpoint de setup solo acepta POST desde el origen de Pages permitido (`APP_ORIGIN` para dominios personalizados).
3. Publica un mensaje de prueba en el grupo y revisa Estado Telegram o `npx wrangler tail`.

El bot solo procesa mensajes de grupos/supergrupos y canales, no conversaciones privadas. Telegram entrega mensajes nuevos al webhook; no permite recuperar mensajes anteriores a la incorporación/configuración del bot.

## WhatsApp

WhatsApp no tiene un bot oficial de WhatsApp personal implementado en este proyecto que lea grupos. Usa el botón **+ Reportar** para enviar manualmente, o Tasker/AutoNotification para interceptar texto de notificaciones nuevas con permiso explícito. No lee el historial ni garantiza todos los mensajes. Consulta `tasker/SETUP.md`.

## Comprobaciones útiles

```bash
curl https://<tu-worker>/api/health
npx wrangler tail
npx wrangler d1 execute patroltrack --remote --command "SELECT id, source, group_name, raw_message FROM detections ORDER BY id DESC LIMIT 10"
```

Tras modificar `schema.sql`, ejecuta de nuevo `npm run db:schema` (las sentencias son idempotentes). Después, despliega el Worker con `npm run deploy`.
