export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    const { model = 'gemini-2.5-flash-lite', payload } = req.body;
    if (!payload) {
        return res.status(400).json({ error: 'Missing payload' });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    let geminiRes;
    for (let attempt = 0; attempt < 3; attempt++) {
        geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (geminiRes.status !== 503 || attempt === 2) break;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }

    if (!geminiRes.ok) {
        const errData = await geminiRes.json().catch(() => ({}));
        return res.status(geminiRes.status).json(errData);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = geminiRes.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
}
