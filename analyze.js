export default async function handler(req, res) {
  // CORS — MenuScan sitenden gelen isteklere izin ver
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64, mimeType, goal, allergens } = req.body;

    if (!imageBase64 || !mimeType || !goal) {
      return res.status(400).json({ error: 'Eksik parametreler' });
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

    const prompt = `Sen diyetisyen yapay zekasısın. Bu restoran menüsünü analiz et.

Kullanıcı: ${goalMap[goal] || goalMap.lose} biri.${alText}

SADECE şu JSON formatında yanıt ver (başka hiçbir şey yazma):
{
  "restaurant": "restoran adı veya Restoran",
  "cuisine": "mutfak türü",
  "bestPick": {
    "name": "yemek adı",
    "reason": "hedefle bağlantılı neden (2-3 cümle, Türkçe)",
    "kcal": 0,
    "protein": 0,
    "carb": 0,
    "fat": 0,
    "tip": "sipariş tavsiyesi (opsiyonel)"
  },
  "items": [
    {
      "name": "yemek adı",
      "score": "HARIKA",
      "desc": "açıklama (1-2 cümle)",
      "kcal": 0,
      "protein": 0,
      "carb": 0,
      "fat": 0,
      "allergens": [],
      "priceValue": "iyi"
    }
  ],
  "generalTip": "genel beslenme tavsiyesi",
  "avoided": []
}

Menü değilse: {"error":"Menü görseli bulunamadı"}. Max 9 yemek. Tüm metinler Türkçe.`;

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
      return res.status(500).json({ error: err.error?.message || 'API hatası' });
    }

    const data = await response.json();
    const text = data.content.map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    if (parsed.error) return res.status(400).json({ error: parsed.error });

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message || 'Sunucu hatası' });
  }
}
