export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    console.log('API Key exists:', !!process.env.ANTHROPIC_API_KEY);
    console.log('Body keys:', Object.keys(req.body || {}));

    const { imageBase64, mimeType, goal, allergens } = req.body;

    if (!imageBase64 || !mimeType || !goal) {
      return res.status(400).json({ error: 'Eksik parametreler: ' + JSON.stringify({ imageBase64: !!imageBase64, mimeType, goal }) });
    }

    const goalMap = {
      lose: 'kilo vermek isteyen, kalori açığında olan',
      maintain: 'kilosunu korumak, dengeli beslenmek isteyen',
      muscle: 'kas yapmak, yüksek protein almak isteyen',
      healthy: 'genel sağlığını iyileştirmek, temiz beslenmek isteyen'
    };

    const alText = allergens?.length > 0
      ? `\nKullanıcının KAÇINMASI gereken: ${allergens.join(', ')}. Bu maddeleri içeren yemeklere "KAÇIN" ver.`
      : '';

    const prompt = `Sen diyetisyen yapay zekasısın. Bu restoran menüsünü analiz et.\n\nKullanıcı: ${goalMap[goal] || goalMap.lose} biri.${alText}\n\nSADECE şu JSON formatında yanıt ver (başka hiçbir şey yazma):\n{\n  "restaurant": "restoran adı veya Restoran",\n  "cuisine": "mutfak türü",\n  "bestPick": {\n    "name": "yemek adı",\n    "reason": "hedefle bağlantılı neden (2-3 cümle, Türkçe)",\n    "kcal": 0,\n    "protein": 0,\n    "carb": 0,\n    "fat": 0,\n    "tip": "sipariş tavsiyesi (opsiyonel)"\n  },\n  "items": [\n    {\n      "name": "yemek adı",\n      "score": "HARIKA",\n      "desc": "açıklama (1-2 cümle)",\n      "kcal": 0,\n      "protein": 0,\n      "carb": 0,\n      "fat": 0,\n      "allergens": [],\n      "priceValue": "iyi"\n    }\n  ],\n  "generalTip": "genel beslenme tavsiyesi",\n  "avoided": []\n}\n\nMenü değilse: {"error":"Menü görseli bulunamadı"}. Max 9 yemek. Tüm metinler Türkçe.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.log('Anthropic error:', JSON.stringify(err));
      return res.status(500).json({ error: err.error?.message || 'API hatası: ' + response.status });
    }

    const data = await response.json();
    const text = data.content.map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    if (parsed.error) return res.status(400).json({ error: parsed.error });
    return res.status(200).json(parsed);

  } catch (err) {
    console.log('Catch error:', err.message);
    return res.status(500).json({ error: err.message || 'Sunucu hatası' });
  }
}
