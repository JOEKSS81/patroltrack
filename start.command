#!/bin/bash
# PatrolTrack — Script d'inici automàtic
# Fes doble clic per arrencar tot

cd "$(dirname "$0")"

NGROK_URL="https://elusive-saturate-qualified.ngrok-free.dev"

echo "🚀 Arrencant PatrolTrack..."
echo ""

# 1. Build del frontend (el backend serveix el dist resultant)
echo "▶ Compilant frontend..."
cd frontend
npm install --silent 2>/dev/null
npm run build --silent || { echo "❌ Build del frontend ha fallat"; exit 1; }
cd ..

# 2. Backend Python (serveix API + frontend compilat al port 8000)
echo "▶ Arrencant backend..."
cd backend
source venv/bin/activate
python main.py &
BACKEND_PID=$!
sleep 3

# 3. WhatsApp listener
echo "▶ Arrencant WhatsApp listener..."
node whatsapp_listener.js &
WA_PID=$!
cd ..
sleep 2

# 4. Ngrok exposa el backend (que ja serveix també el frontend)
echo "▶ Arrencant ngrok..."
ngrok http 8000 > /dev/null &
NGROK_PID=$!
sleep 4

echo ""
echo "✅ Tot arrencat!"
echo "🖥  URL local (Mac):       http://localhost:8000"
echo "📱 URL pública (mòbil):   $NGROK_URL"
echo ""
echo "Prem Ctrl+C per aturar tot"

# Obre el navegador del Mac
open "http://localhost:8000"

# Espera fins Ctrl+C i atura-ho tot
trap "echo ''; echo 'Aturant...'; kill $BACKEND_PID $WA_PID $NGROK_PID 2>/dev/null; exit" INT
wait
