const fs = require('fs');
const https = require('https');

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK;
const HISTORY_FILE = 'history.json';

async function sendToDiscord(product) {
    if (!DISCORD_WEBHOOK_URL) return;
    const data = JSON.stringify({
        content: `🚨 **Nowy Funko POP na Empiku!**\n📦 **${product.name}**\n💰 Cena: ${product.price} zł\n🔗 ${product.url}`
    });

    const url = new URL(DISCORD_WEBHOOK_URL);
    const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    };

    return new Promise((resolve) => {
        const req = https.request(options, (res) => { res.on('data', () => {}); res.on('end', resolve); });
        req.on('error', () => resolve());
        req.write(data);
        req.end();
    });
}

async function checkEmpik() {
    if (!fs.existsSync(HISTORY_FILE)) {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
    }

    let history = JSON.parse(fs.readFileSync(HISTORY_FILE));

    try {
        console.log("Pobieram dane przez fetch...");
        
        const response = await fetch("https://www.empik.com/szukaj/produkt?q=funko+pop", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7"
            }
        });

        console.log(`Kod odpowiedzi HTTP: ${response.status}`);
        const html = await response.text();

        // Proste wyciąganie linków produktów za pomocą regexu z surowego HTML
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
                    price: 'Sprawdź',
                    url: cleanUrl
                });
            }
        }

        const products = Array.from(productsMap.values());
        console.log(`Znaleziono produktów: ${products.length}`);

        let updated = false;
        for (const p of products) {
            if (!history.includes(p.id)) {
                console.log(`Nowy produkt wykryty: ${p.url}`);
                await sendToDiscord(p);
                history.push(p.id);
                updated = true;
            }
        }

        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        console.log(`Zapisano historię. Łącznie unikalnych ID w bazie: ${history.length}`);

    } catch (error) {
        console.error("Błąd podczas pobierania:", error);
        process.exit(1);
    }
}

checkEmpik();
