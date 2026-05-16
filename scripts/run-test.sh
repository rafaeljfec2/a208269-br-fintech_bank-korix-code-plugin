#!/bin/bash

# Script que carrega as variáveis do .bashrc e executa o teste do LiteLLM

echo "🔄 Carregando variáveis do .bashrc..."

# Carrega o .bashrc
if [ -f ~/.bashrc ]; then
  source ~/.bashrc
fi

# Verifica se as variáveis foram carregadas
if [ -z "$ANTHROPIC_AUTH_TOKEN" ] && [ -z "$LITELLM_API_KEY" ]; then
  echo "❌ Nenhuma API key encontrada!"
  echo ""
  echo "Adicione ao seu .bashrc:"
  echo "  export ANTHROPIC_AUTH_TOKEN=sua-chave"
  echo ""
  echo "Depois execute:"
  echo "  source ~/.bashrc"
  exit 1
fi

echo "✅ Variáveis carregadas:"
echo "   ANTHROPIC_BASE_URL: ${ANTHROPIC_BASE_URL:-não definida}"
echo "   ANTHROPIC_MODEL: ${ANTHROPIC_MODEL:-não definida}"
echo "   ANTHROPIC_AUTH_TOKEN: ${ANTHROPIC_AUTH_TOKEN:0:10}...${ANTHROPIC_AUTH_TOKEN: -4}"
echo ""

# Executa o teste
pnpm tsx scripts/test-litellm.ts
