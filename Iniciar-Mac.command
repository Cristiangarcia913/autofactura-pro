#!/bin/bash
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo " Falta instalar Node.js. Descargalo en https://nodejs.org (boton LTS),"
  echo " instalalo y vuelve a hacer doble clic en este archivo."
  echo ""
  read -n 1 -s -r -p " Pulsa cualquier tecla para cerrar..."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i '' 's/MOCK_AI=0/MOCK_AI=1/' .env
fi

if [ ! -d node_modules ]; then
  echo ""
  echo " Primera vez: instalando. Tarda 1-2 minutos, no cierres esta ventana..."
  echo ""
  npm install || { echo ""; echo " Algo ha fallado. Copia este texto y enviaselo a Claude."; read -n 1 -s -r -p " Pulsa una tecla..."; exit 1; }
fi

echo ""
echo " Arrancando AutoFactura Pro... se abrira el navegador."
echo " PARA APAGARLA: cierra esta ventana o pulsa Control+C."
echo ""
( sleep 4 && open "http://localhost:3000" ) &
npm start
echo ""
read -n 1 -s -r -p " La aplicacion se ha detenido. Pulsa una tecla para cerrar..."
