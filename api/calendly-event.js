export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { eventUri } = req.body || {};
    if (!eventUri || !eventUri.startsWith('https://api.calendly.com/scheduled_events/')) {
        return res.status(400).json({ error: 'invalid eventUri' });
    }

    const token = process.env.CALENDLY_TOKEN;
    if (!token) return res.status(500).json({ error: 'token not configured' });

    try {
        const response = await fetch(eventUri, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) return res.status(502).json({ error: 'calendly error' });

        const data = await response.json();
        const startTime = data?.resource?.start_time;
        if (!startTime) return res.status(404).json({ error: 'no start_time' });

        res.json({ startTime });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
