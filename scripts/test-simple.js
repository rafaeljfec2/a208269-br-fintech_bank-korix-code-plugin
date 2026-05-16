// Teste super simples com fetch puro para debug
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function test() {
  const url = 'https://litellm.int.thomsonreuters.com/v1/chat/completions';
  const apiKey = process.env.ANTHROPIC_AUTH_TOKEN || process.env.LITELLM_API_KEY;

  console.log('🧪 Teste com fetch puro');
  console.log('URL:', url);
  console.log('API Key:', apiKey?.substring(0, 10) + '...' + apiKey?.slice(-4));
  console.log('');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-litellm-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-6',
        messages: [{role: 'user', content: 'Hi'}],
        stream: false,
        max_tokens: 10,
      }),
    });

    console.log('Status:', response.status, response.statusText);
    console.log('Headers:', Object.fromEntries(response.headers));
    const text = await response.text();
    console.log('Body:', text.substring(0, 500));

    if (response.ok) {
      console.log('\n✅ FUNCIONOU!');
    } else {
      console.log('\n❌ Erro', response.status);
    }
  } catch (error) {
    console.error('❌ Exception:', error.message);
  }
}

test();
