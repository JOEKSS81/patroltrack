# Tasker al Huawei P40 Lite — Configuración de WhatsApp

Esta integración **no lee la base de datos privada de WhatsApp**. Tasker/AutoNotification solo puede reaccionar al contenido que WhatsApp exponga en las notificaciones; depende de los ajustes de privacidad, del sistema Android/EMUI y de si el grupo está silenciado. Por eso no se garantiza capturar todos los mensajes ni historiales.

## Opción manual (más fiable)

1. Abre WhatsApp y copia el mensaje que quieres reportar.
2. En la app PatrolTrack usa **+ Reportar** y pega el texto; o configura HTTP Shortcuts para hacer un `POST` a `/api/ingest`.
3. Envía `source: "whatsapp"`, el nombre del grupo y el token en la cabecera `x-ingest-token`.

Ejemplo de cuerpo JSON:

```json
{"message":"Mossos a la N-II km 45, cuidado","group_name":"Avisos tráfico","source":"whatsapp"}
```

## Opción automática con Tasker y AutoNotification

Requiere Tasker, AutoNotification y permiso de acceso a notificaciones concedido explícitamente. En EMUI/HarmonyOS puede ser necesario excluir ambas apps de la optimización de batería. AutoNotification intercepta **notificaciones nuevas**, no mensajes antiguos; puede recibir solo una vista previa, un resumen de varias notificaciones o ningún texto si el grupo/app oculta el contenido.

1. Crea un perfil **Event → Plugin → AutoNotification → Intercept** y limita la aplicación a WhatsApp.
2. En la tarea usa el texto `%antext` y el título `%antitle`. Comprueba en el móvil que realmente contienen el mensaje y el nombre del grupo antes de activar el envío.
3. Añade un filtro opcional para grupos que elijas tú.
4. Envía un POST a `https://<tu-worker>/api/ingest`, con cabeceras `content-type: application/json` y `x-ingest-token: <tu-token>`.
5. Usa un cuerpo JSON válido; evita interpolar texto sin escapar. Si Tasker no permite escapar JSON de forma segura, usa HTTP Shortcuts con entrada manual.

No se debe poner el token en una URL compartida, en un perfil público ni en logs. Los mensajes se envían únicamente a tu propio Worker y quedan almacenados como detecciones cuando el filtro del servidor los reconoce.

## Verificación y límites

- Comprueba primero que un mensaje de prueba aparece en `wrangler tail`.
- Revisa la respuesta del endpoint: `stored: true` significa que pasó el filtro; `stored: false` significa que llegó pero no se clasificó como alerta.
- Android/WhatsApp puede agrupar, ocultar o retrasar notificaciones. Una notificación de resumen no permite recuperar necesariamente cada mensaje original.
- Respeta la privacidad de las personas del grupo y comparte solo mensajes para los que tengas autorización.
