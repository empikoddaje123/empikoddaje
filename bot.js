const fs = require('fs');
const https = require('https');

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK;
const HISTORY_FILE = 'history.json';

async function sendToDiscord(product) {
    if (!DISCORD_WEBHOOK_URL) return;
    const data = JSON.stringify({
        content: `🚨 **Nowy Funko POP na Empiku!**\n📦 **${product.name}**\n💰 Cena: ${product.price}\n🔗 ${product.url}`
    });

    const url = new URL(DISCORD_WEBHOOK_URL);
    const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };

    return new Promise((resolve) => {
        const req = https.request(options, (res) => { res.on('data', () => {}); res.on('end', resolve); });
        req.on('error', () => resolve());
        req.write(data);
        req.end();
    });
}

async function checkEmpik() {
    // Dynamiczny import ESM dla biblioteki got-scraping w środowisku CommonJS
    const { gotScraping } = await import('got-scraping');

    if (!fs.existsSync(HISTORY_FILE)) {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
    }

    let history = JSON.parse(fs.readFileSync(HISTORY_FILE));

    try {
        console.log("Pobieram dane przez got-scraping...");

        const response = await gotScraping({
            url: "https://www.empik.com/szukaj/produkt?q=funko+pop",
            headerGeneratorOptions: {
                browsers: [{ name: 'chrome', minVersion: 110 }],
                devices: ['desktop'],
                locales: ['pl-PL'],
                operatingSystems: ['windows']
            }
        });

        console.log(`Kod odpowiedzi HTTP: ${response.statusCode}`);
        const html = response.body;

        const regex = /href="([^"]*\/p\/[^"]+)"/g;
        let match;
        const productsMap = new Map();

        while ((match = regex.exec(html)) !== null) {
            let cleanUrl = match[1].split('?')[0];
            if (!cleanUrl.startsWith('http')) {
                cleanUrl = `https://www.empik.com${cleanUrl}`;
            }
            const idMatch = cleanUrl.match(/-p([0-9a-z]+)$/i);
            const id = idMatch ? idMatch[1] : cleanUrl;
            
            if (!productsMap.has(id)) {
                productsMap.set(id, {
                    id: id,
                    name: 'Funko POP (Empik)',
                    price: 'Sprawdź na stronie',
                    url: cleanUrl
                });
            }
        }

        const products = Array.from(productsMap.values());
        console.log(`Znaleziono produktów: ${products.length}`);

        let updated = false;
        for (const p of products) {
            if (!history.includes(p.id)) {
                console.log(`Nowy produkt: ${p.url}`);
                await sendToDiscord(p);
                history.push(p.id);
                updated = true;
            }
        }

        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        console.log(`Zapisano historię. Łącznie w bazie: ${history.length}`);

    } catch (error) {
        console.error("Błąd podczas pobierania:", error.message);
        process.exit(1);
    }
}

checkEmpik();
