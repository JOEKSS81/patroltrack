# PatrolTrack — Desplegament a Cloudflare

L'objectiu d'aquesta carpeta és tenir tot el backend funcionant a Cloudflare:
**zero servidors propis, sense Mac encès, gratis per sempre**.

```
Mòbil Huawei (Tasker)  ─→  Cloudflare Worker  ─→  D1 (SQLite)
                                  ↑
                       Cloudflare Pages (React)
                                  ↑
                              tu, al navegador
```

---

## Prerequisits (una vegada)

1. Compte gratuït a [cloudflare.com](https://dash.cloudflare.com/sign-up) — només email i contrasenya, **sense targeta**.
2. Tenir Node.js instal·lat al Mac (`node -v` ha de respondre).

---

## Pas 1 — Instal·la dependències

```bash
cd cloudflare
npm install
```

## Pas 2 — Inicia sessió amb wrangler

```bash
npx wrangler login
```

S'obrirà el navegador per autoritzar. Acceptes i tornes al terminal.

## Pas 3 — Crea la base de dades D1

```bash
npx wrangler d1 create patroltrack
```

La sortida t'imprimirà alguna cosa com:

```toml
[[d1_databases]]
binding = "DB"
database_name = "patroltrack"
database_id = "abc123-def456-..."
```

**Copia el `database_id`** i enganxa'l a `wrangler.toml` en lloc de
`REPLACE_WITH_D1_ID_FROM_CREATE_OUTPUT`.

## Pas 4 — Crea l'esquema de taules

```bash
npm run db:schema
```

## Pas 5 — Configura el token secret per a Tasker

Aquest token impedirà que qualsevol pugui inserir deteccions falses.
Genera'n un de llarg (32+ caràcters) — pots fer servir `openssl rand -hex 32`
al terminal o qualsevol gestor de contrasenyes.

```bash
npm run secret:set
# (enganxa el token quan te'l demani)
```

Apunta't el token: el necessitaràs al mòbil quan configuris Tasker.

## Pas 6 — Desplega el Worker

```bash
npm run deploy
```

Sortida esperada:

```
Uploaded patroltrack-api (X.XX KiB)
Published patroltrack-api (X.XX KiB)
  https://patroltrack-api.<el-teu-subdomini>.workers.dev
```

**Apunta't aquesta URL.** Aquesta serà l'API que farà servir el frontend i
el mòbil.

## Pas 7 — Verifica que funciona

```bash
curl https://patroltrack-api.<subdomini>.workers.dev/api/health
# → {"status":"ok","total":0,"last_24h":0}
```

I prova l'ingestió amb el token:

```bash
curl -X POST https://patroltrack-api.<subdomini>.workers.dev/api/ingest \
  -H "content-type: application/json" \
  -H "x-ingest-token: <el-teu-token>" \
  -d '{"message":"Mossos a la N-II km 45, cuidado","group_name":"Test"}'
# → {"ok":true,"stored":true,"id":1,"patrol_type":"mossos",...}
```

## Pas 8 — Desplega el frontend a Cloudflare Pages

Des de l'arrel del repo:

```bash
cd ../frontend
VITE_API_URL=https://patroltrack-api.<subdomini>.workers.dev npm run build
npx wrangler pages deploy dist --project-name patroltrack
```

La primera vegada et preguntarà per crear el projecte: accepta.
Sortida final:

```
✨ Deployed to https://patroltrack.pages.dev
```

**Aquesta és la URL definitiva de l'app.** L'obres al mòbil, "Afegir a la
pantalla d'inici", i ja tens icona PWA sense dependre de res del teu Mac.

---

## Manteniment

- Veure deteccions per CLI: `npx wrangler d1 execute patroltrack --remote --command "SELECT * FROM detections ORDER BY id DESC LIMIT 10"`
- Logs en viu del Worker: `npx wrangler tail`
- Esborrar la base i recomençar: `npx wrangler d1 execute patroltrack --remote --command "DELETE FROM detections"`
- Re-desplegar després de canvis al codi: `npm run deploy`

## Costos i límits (Cloudflare Free plan)

| Recurs | Límit gratuït | Què consumim |
|---|---|---|
| Worker | 100k peticions/dia | ~1k/dia màxim |
| D1 lectures | 5 milions/dia | ~10k/dia |
| D1 escriptures | 100k/dia | ~50/dia |
| D1 emmagatzematge | 5 GB | ~10 MB |
| Pages | Il·limitat | — |

Mai els tocaràs.

---

## Configuració de Tasker al mòbil

Vegeu [tasker/SETUP.md](tasker/SETUP.md).
