#!/bin/bash
# UFQ-CRM — admin, student va mentor ilovalarini Vercel'ga chiqaradi.
#
#   1) bir marta:  vercel login
#   2) keyin:      bash deploy-demo.sh
#
# Har bir ilova alohida Vercel loyihasi bo'lgani uchun uchalasi navbat bilan
# chiqariladi. `--prod` — jonli manzilga (ufq-crm-*.vercel.app).
set -e
cd "$(dirname "$0")"

if ! vercel whoami >/dev/null 2>&1; then
  echo "❌ Vercel'ga kirilmagan. Avval shuni bajaring:  vercel login"
  exit 1
fi

for app in admin student mentor; do
  echo ""
  echo "══════════ $app ══════════"
  (
    cd "$app"
    npm install --silent
    npx vite build
    vercel deploy --prod --yes
  )
done

echo ""
echo "✅ Tayyor. Endi tekshiring:"
echo "   https://ufq-crm-admin.vercel.app/demo-mode.js   ← JavaScript qaytishi kerak"
echo "   https://ufq-crm-admin.vercel.app/dashboard?demo=1"
