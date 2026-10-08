#!/bin/bash
# ─────────────────────────────────────────────────────
#  EduManage CRM — LOKAL ishga tushirish
#
#  Bitta server (PORT=3000) uchala portalni ham beradi:
#     http://localhost:3000/admin
#     http://localhost:3000/mentor
#     http://localhost:3000/student
#
#  Frontend kodi (src/) o'zgargan bo'lsa avtomatik qayta build qilinadi.
#  Faqat backend'ni ishga tushirish uchun:  ./start-all.sh --no-build
# ─────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"
ROOT="$PWD"

BUILD=1
[ "$1" = "--no-build" ] && BUILD=0

echo ""
echo "🚀 EduManage CRM (lokal) ishga tushmoqda..."
echo ""

# ── Portallarni build qilish ─────────────────────────
if [ "$BUILD" = "1" ]; then
  for P in admin mentor student; do
    cd "$ROOT/$P"
    if [ ! -d node_modules ]; then
      echo "📦 $P dependencies o'rnatilmoqda..."
      npm install --silent
    fi
    echo "🔨 $P build qilinmoqda..."
    npm run build --silent >/dev/null
  done
  cd "$ROOT"
  echo "✅ Uchala portal build qilindi"
  echo ""
fi

# ── Backend ──────────────────────────────────────────
cd "$ROOT/backend"
if [ ! -d node_modules ]; then
  echo "📦 Backend dependencies o'rnatilmoqda..."
  npm install --silent
fi

PORT_VAL=$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
PORT_VAL=${PORT_VAL:-3000}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔵 Admin:   http://localhost:$PORT_VAL/admin"
echo "  🟢 Mentor:  http://localhost:$PORT_VAL/mentor"
echo "  🟡 Talaba:  http://localhost:$PORT_VAL/student"
echo "  🔧 API:     http://localhost:$PORT_VAL/api"
echo "  ⚡ Realtime: http://localhost:$PORT_VAL/api/events"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  To'xtatish uchun: Ctrl+C"
echo ""

node server.js
