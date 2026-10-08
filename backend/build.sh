#!/bin/bash
# Render build script — Vue portallarini build qiladi, keyin npm install
set -e

ROOT="$(dirname "$(cd "$(dirname "$0")" && pwd)")"
echo "📁 Root: $ROOT"

echo ""
echo "📦 Admin portal build qilinmoqda..."
cd "$ROOT/admin"
npm install
VITE_BASE_PATH=/admin/ npm run build
echo "✅ Admin portal ready"

echo ""
echo "📦 Mentor portal build qilinmoqda..."
cd "$ROOT/mentor"
npm install
VITE_BASE_PATH=/mentor/ npm run build
echo "✅ Mentor portal ready"

echo ""
echo "📦 Talaba portal build qilinmoqda..."
cd "$ROOT/student"
npm install
VITE_BASE_PATH=/student/ npm run build
echo "✅ Talaba portal ready"

echo ""
echo "📦 Backend dependencies..."
cd "$ROOT/backend"
npm install
echo "✅ Backend ready"

echo ""
echo "🎉 Build yakunlandi!"
echo "   /admin  → $ROOT/admin/dist"
echo "   /mentor → $ROOT/mentor/dist"
echo "   /student→ $ROOT/student/dist"