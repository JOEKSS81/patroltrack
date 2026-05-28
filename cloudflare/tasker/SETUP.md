# Tasker al Huawei P40 Lite — Setup pas a pas

L'objectiu: que el teu mòbil capti automàticament els missatges dels grups
de WhatsApp que tu marquis, filtri els que parlen de patrulles per
paraules clau, i els enviï a la teva API de Cloudflare. **Tot en segon pla,
sense fer res tu**.

---

## Què cal instal·lar al mòbil

El P40 Lite no té Play Store, així que ho instal·larem des dels APK
oficials dels autors. Tot legal i directe.

### 1. Tasker (3,49 € pagament únic)

Descarrega l'APK oficial des de [tasker.joaoapps.com](https://tasker.joaoapps.com/).
Botó "Download APK" → instal·la al mòbil. Quan obris l'app comprarà la
llicència via web.

### 2. AutoNotification (gratis, mateix autor)

Descarrega'l des de [joaoapps.com/autoapps/details/autonotification](https://joaoapps.com/autoapps/details/autonotification/).
És el plugin que permet a Tasker llegir el contingut de les notificacions
de WhatsApp.

---

## Configuració crítica de bateria (NO et saltis aquest pas)

EMUI / HarmonyOS mata els processos en segon pla. Sense aquest pas el
sistema funcionarà 1-2 hores i es pararà sol.

### Per a **Tasker** i **AutoNotification** i **WhatsApp**, fes per cadascú:

1. **Configuració → Bateria → Llançament d'apps**
2. Busca l'app a la llista
3. Apaga "Gestió automàtica" (interruptor a la dreta)
4. Activa **manualment** els 3 interruptors:
   - ✅ Llançament automàtic
   - ✅ Llançament secundari
   - ✅ Executar en segon pla
5. Confirma

També:

- **Configuració → Apps → Tasker → Bateria → No restringeix** (mateix per a AutoNotification i WhatsApp)
- **Configuració → Bateria → Optimització de bateria → Tasker → No optimitzar**

---

## Permisos d'accés a notificacions

1. **Configuració → Apps → Accés especial → Accés a notificacions**
2. Activa **Tasker** i **AutoNotification**

Aquest permís és el que els permet llegir el text que apareix a la barra
de notificacions quan rebs un missatge de WhatsApp.

---

## Crear el perfil de Tasker

### A. Importa el perfil prefet (recomanat)

Còpia el fitxer `PatrolTrack.prf.xml` (al mateix directori que aquest
SETUP.md) al teu mòbil — pots:

- enviar-te'l per email i obrir-lo al mòbil,
- pujar-lo a Google Drive / WhatsApp web i descarregar al mòbil,
- connectar el mòbil per USB i copiar a la carpeta `Tasker/projects/`.

A Tasker: long-press a la pestanya "Profiles" → **Import**.

### B. O crea'l manualment (5 minuts)

Si l'import no funciona o vols entendre què fa:

1. **A Tasker → pestanya Profiles → +** (icona inferior dreta)
2. Esculliu **Event → Plugin → AutoNotification → Intercept**
3. Configura:
   - **Configuration → Edit** → activa només **Notification Apps: WhatsApp**
   - Opcionalment, **Title** o **Text** per filtrar grups concrets (deixa buit per ara, filtrarem al codi del task)
4. Anomena el perfil: "PatrolTrack WhatsApp"

5. Crea una nova tasca anomenada **"Send PatrolTrack"** vinculada al perfil:
   - Acció 1 — **Variables → Variable Set**
     - Name: `%TEXT`
     - To: `%antext` (el text del missatge que ve d'AutoNotification)
   - Acció 2 — **Variables → Variable Set**
     - Name: `%GRP`
     - To: `%antitle` (el títol de la notificació — sol ser el nom del grup o contacte)
   - Acció 3 — **Task → If**
     - `%TEXT ~R (?i)(mossos|guardia|control|patrulla|radar|cuidado|alerta|policia|mse|gc|policía)`
     - (l'operador `~R` és "match regex")
   - Acció 4 — **Net → HTTP Request**
     - Method: `POST`
     - URL: `https://patroltrack-api.<el-teu-subdomini>.workers.dev/api/ingest`
     - Headers:
       ```
       content-type: application/json
       x-ingest-token: <el-teu-token>
       ```
     - Body:
       ```json
       {"message":"%TEXT","group_name":"%GRP","source":"whatsapp"}
       ```
   - Acció 5 — **End If**

6. Activa el perfil amb l'interruptor de la dreta.

### Provar que funciona

1. Demana a algú que t'enviï un missatge a un grup amb la paraula "control" o "mossos"
2. Comprova al mòbil que apareix una notificació de Tasker (opcional, només si tens debug activat)
3. Al Mac executa:
   ```bash
   cd cloudflare
   npx wrangler tail
   ```
   Hauries de veure el POST entrant.
4. O comprova la base directament:
   ```bash
   npx wrangler d1 execute patroltrack --remote --command "SELECT id, zone_norm, patrol_type, raw_message FROM detections ORDER BY id DESC LIMIT 5"
   ```
5. Obre la PWA al mòbil — la detecció hi apareixerà.

---

## Filtrar només grups concrets

Per defecte el perfil captura **totes** les notificacions de WhatsApp.
Si només vols certs grups:

- **Tasker → el perfil → Edit → Configuration de AutoNotification → Title**
  posa-hi `Nom del grup` (o `Grup A|Grup B` separats per `|` per a regex)
- O afegeix una `If %GRP ~R (Patrullers Lleida|Avisos Trànsit)` abans del
  HTTP Request al task

---

## Llista de paraules clau (la que el mòbil filtra abans d'enviar)

```
mossos | guardia | control | patrulla | radar | cuidado |
alerta | policia | mse | gc | policía
```

Pots ampliar-la canviant la regex de l'Acció 3 del task. El backend al
Cloudflare encara fa un segon filtre més fi (vegeu `cloudflare/src/extractor.ts`),
així que ser permissiu aquí és OK.

---

## Resolució de problemes

| Símptoma | Causa probable | Solució |
|---|---|---|
| Després d'una estona deixa de capturar | EMUI ha matat Tasker en segon pla | Repetir TOTS els passos de "Configuració crítica de bateria" |
| Cap missatge arriba al Worker | Token incorrecte o URL malament | `wrangler tail` al Mac mostrarà l'intent fallit amb 401 o 404 |
| Captura però el Worker diu `stored:false` | El filtre del backend l'ha descartat | És correcte: vol dir que el missatge no parlava de patrulles |
| HTTP Request del Tasker dóna error | Sense Internet, o URL malament | Comprova URL amb un curl manual |
