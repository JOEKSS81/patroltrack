# iPhone — drecera «PatrolTrack» (app Dreceres)

L'iPhone no deixa que cap app llegeixi les notificacions de WhatsApp/Telegram, així que
MacroDroid no hi existeix. L'alternativa és una drecera que envia a `/api/ingest` el text
que l'usuari **comparteix** o **copia**.

L'app ja detecta si el mòbil és iPhone o Android (`frontend/src/lib/platform.js`) i a
Config → «Connecta els teus grups» mostra només la guia que toca.

## Crear l'enllaç iCloud (un sol cop, des de qualsevol iPhone)

Així els amics només toquen «Obrir a Dreceres» i enganxen la clau.

1. Dreceres → **+** → nom **PatrolTrack**.
2. **ⓘ** → activa **Mostrar al full de compartir**. A «Rebre … de» deixa només **Text**;
   a «Si no hi ha entrada» tria **Obtenir el porta-retalls**.
3. Acció **Text** → escriu `ENGANXA_AQUÍ_LA_CLAU` (serà la pregunta d'importació).
4. Acció **Obtenir el contingut de l'URL**:
   - URL: `https://patroltrack-api.patroltrack.workers.dev/api/ingest`
   - Mètode: **POST**
   - Capçalera `x-ingest-token` = la variable **Text** del pas 3
   - Cos **JSON**: `message` = **Entrada de la drecera**, `group_name` = `Drecera iPhone`,
     `source` = `whatsapp`
5. Acció **Obtenir el valor del diccionari** → clau `stored`.
6. **Si** el valor *és* `1` → **Mostrar notificació** «✓ Avís enviat a PatrolTrack».
   **Altrament** → **Obtenir el valor del diccionari** `reason` del *Contingut de l'URL* →
   **Mostrar notificació** amb aquest valor.
7. ⓘ → **Configurar la drecera** (Preguntes d'importació) → afegeix el camp *Text* del
   pas 3 amb la pregunta «Enganxa la teva clau de PatrolTrack (Config → Copiar la meva clau)».
   **Esborra la teva clau del pas 3 abans de compartir.**
8. Compartir → **Copiar l'enllaç d'iCloud**.
9. Posa l'enllaç al secret/variable `VITE_IOS_SHORTCUT_URL` del build (workflow
   `.github/workflows/deploy.yml`, bloc `env`). Sense aquesta variable, l'app mostra com
   crear-la a mà.

## Primera prova

La primera vegada la drecera respon «grup nou»: a Config → «Els meus grups» cal tocar
**Seguir** a **Drecera iPhone**. A partir d'aquí, els avisos entren directament.
