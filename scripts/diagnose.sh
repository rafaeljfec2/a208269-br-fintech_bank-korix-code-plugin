#!/bin/bash

echo "🔍 Diagnóstico do LiteLLM Provider"
echo "=================================="
echo ""

# 1. Carregar variáveis
if [ -f ~/.bashrc ]; then
  source ~/.bashrc
fi

# 2. Check conectividade básica
echo "1️⃣ Testando conectividade com o endpoint..."
if curl -s --connect-timeout 5 https://litellm.int.thomsonreuters.com > /dev/null 2>&1; then
  echo "   ✅ Conexão OK"
else
  echo "   ❌ Não consegue conectar ao endpoint"
  echo "   💡 Verifique:"
  echo "      - Z-scaler está ativo?"
  echo "      - Está na VPN Thomson Reuters?"
  exit 1
fi
echo ""

# 3. Check se retorna HTML (indica problema de proxy/auth)
echo "2️⃣ Testando resposta do endpoint..."
RESPONSE=$(curl -s https://litellm.int.thomsonreuters.com/v1/models 2>&1 | head -c 100)
if [[ "$RESPONSE" == *"<html>"* ]] || [[ "$RESPONSE" == *"<HTML>"* ]]; then
  echo "   ❌ Endpoint retornando HTML (problema de autenticação/proxy)"
  echo "   💡 Causas comuns:"
  echo "      - Z-scaler bloqueando (adicione exceção)"
  echo "      - Proxy corporativo interceptando"
  echo "      - Sem autenticação no Z-scaler"
else
  echo "   ✅ Resposta parece OK (não é HTML)"
fi
echo ""

# 4. Check variáveis de ambiente
echo "3️⃣ Verificando variáveis de ambiente..."
if [ -z "$ANTHROPIC_AUTH_TOKEN" ]; then
  echo "   ❌ ANTHROPIC_AUTH_TOKEN não definida"
  exit 1
else
  echo "   ✅ ANTHROPIC_AUTH_TOKEN: ${ANTHROPIC_AUTH_TOKEN:0:10}...${ANTHROPIC_AUTH_TOKEN: -4}"
fi

if [ -z "$ANTHROPIC_BASE_URL" ]; then
  echo "   ⚠️  ANTHROPIC_BASE_URL não definida (usando default)"
else
  echo "   ✅ ANTHROPIC_BASE_URL: $ANTHROPIC_BASE_URL"
fi

if [ -z "$ANTHROPIC_MODEL" ]; then
  echo "   ⚠️  ANTHROPIC_MODEL não definida (usando default)"
else
  echo "   ✅ ANTHROPIC_MODEL: $ANTHROPIC_MODEL"

  # Valida modelo
  if [[ ! "$ANTHROPIC_MODEL" =~ ^(anthropic|openai|gemini)\/ ]]; then
    echo "   ❌ Modelo inválido: deve ter vendor prefix (ex: anthropic/claude-sonnet-4-6)"
  fi
fi
echo ""

# 5. Test autenticação com a API
echo "4️⃣ Testando autenticação com a API..."
AUTH_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "x-litellm-api-key: $ANTHROPIC_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  https://litellm.int.thomsonreuters.com/v1/models 2>&1)

HTTP_CODE=$(echo "$AUTH_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Autenticação OK!"
elif [ "$HTTP_CODE" = "401" ]; then
  echo "   ❌ Autenticação FALHOU (401 Unauthorized)"
  echo "   💡 API key inválida ou expirada"
  echo "      Gere nova chave em: https://litellm-self-service.8663.aws-int.thomsonreuters.com"
elif [ "$HTTP_CODE" = "403" ]; then
  echo "   ❌ Acesso NEGADO (403 Forbidden)"
  echo "   💡 Possíveis causas:"
  echo "      - Z-scaler bloqueando requisições"
  echo "      - IP não autorizado"
  echo "      - Budget excedido ($1000/mês)"
elif [ -z "$HTTP_CODE" ]; then
  echo "   ❌ Sem resposta HTTP"
  echo "   💡 Problema de rede/conectividade"
else
  echo "   ❌ Erro HTTP $HTTP_CODE"
  echo "   Resposta: ${AUTH_RESPONSE:0:200}"
fi
echo ""

# 6. Sumário
echo "📋 Resumo"
echo "========="
echo ""
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Tudo OK! Pode executar: pnpm run test:litellm"
else
  echo "❌ Problema detectado. Siga as sugestões acima para corrigir."
  echo ""
  echo "🆘 Se precisar de ajuda:"
  echo "   - MS Teams: LiteLLM Support"
  echo "   - Dashboard: https://litellm.int.thomsonreuters.com/ui"
  echo "   - Self-Service: https://litellm-self-service.8663.aws-int.thomsonreuters.com"
fi
