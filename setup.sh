#!/bin/bash
set -e

echo ""
echo "Instalando o Painel de Chamados..."
echo ""

if ! command -v node &> /dev/null; then
  echo "Node.js nao encontrado. Instale o Node.js (versao 22.5 ou superior) antes de continuar:"
  echo "https://nodejs.org/"
  exit 1
fi

echo "Node.js encontrado: $(node -v)"

mkdir -p uploads
mkdir -p db

echo ""
echo "Instalando dependencias (npm install)..."
npm install

echo ""
echo "Preparando o banco de dados..."
npm run seed

echo ""
echo "Tudo pronto! Iniciando o servidor..."
echo ""
npm start
