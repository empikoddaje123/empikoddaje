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

        const productsMap = new Map();

        // 1. Ekstrakcja z danych strukturalnych JSON-LD (jeśli obecne w HTML)
        const jsonLdMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
        if (jsonLdMatches) {
            for (const script of jsonLdMatches) {
                try {
                    const jsonText = script.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
                    const data = JSON.parse(jsonText);
                    const items = Array.isArray(data) ? data : (data.itemListElement || [data]);
                    
                    items.forEach(item => {
                        const prod = item.item || item;
                        if (prod && (prod['@type'] === 'Product' || prod.name)) {
                            const url = prod.url || prod['@id'];
                            const name = prod.name;
                            const idMatch = url ? url.match(/,p(\d+)/) : null;
                            const id = idMatch ? idMatch[1] : (url || name);
                            
                            if (url && name) {
                                productsMap.set(id, {
                                    id: id,
                                    name: name,
                                    price: prod.offers?.price ? `${prod.offers.price} zł` : 'Sprawdź na stronie',
                                    url: url.startsWith('http') ? url : `https://www.empik.com${url}`
                                });
                            }
                        }
                    });
                } catch (e) {}
            }
        }

        // 2. Dopasowanie linków produktowych Empiku (wzorce: ,p12345678, -p12345678 lub /p/)
        const linkRegex = /href="([^"]*?(?:,p\d+|-p\d+|\/p\/)[^"]*?)"/gi;
        let match;

        while ((match = linkRegex.exec(html)) !== null) {
            let rawUrl = match[1].split('?')[0];
            if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;
            if (!rawUrl.startsWith('http')) rawUrl = `https://www.empik.com${rawUrl}`;

            const idMatch = rawUrl.match(/,p(\d+)/i) || rawUrl.match(/-p(\d+)/i) || rawUrl.match(/\/p\/([^\/]+)/i);
            const id = idMatch ? idMatch[1] : rawUrl;

            if (!productsMap.has(id) && !rawUrl.includes('/szukaj/')) {
                const urlSegments = rawUrl.split('/');
                const slug = urlSegments[urlSegments.length - 1] || '';
                const cleanName = slug.split(',p')[0].replace(/-/g, ' ').toUpperCase();

                productsMap.set(id, {
                    id: id,
                    name: cleanName || 'Funko POP (Empik)',
                    price: 'Sprawdź na stronie',
                    url: rawUrl
                });
            }
        }

        const products = Array.from(productsMap.values());
        console.log(`Znaleziono produktów: ${products.length}`);
        
        if (products.length > 0) {
            console.log("Przykładowe wykryte produkty:\n", JSON.stringify(products.slice(0, 3), null, 2));
        }

        let updated = false;
        for (const p of products) {
            if (!history.includes(p.id)) {
                console.log(`Nowy produkt: ${p.name} (${p.url})`);
                await sendToDiscord(p);
                history.push(p.id);
                updated = true;
            }
        }

        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        console.log(`Zapisano historię. Łącznie unikalnych ID w bazie: ${history.length}`);

    } catch (error) {
        console.error("Błąd podczas pobierania:", error.message);
        process.exit(1);
    }
}

checkEmpik();
