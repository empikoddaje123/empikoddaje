const puppeteer = require('puppeteer');
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

    const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

    let history = JSON.parse(fs.readFileSync(HISTORY_FILE));

    try {
        console.log("Otwieram stronę Empiku...");
        await page.goto("https://www.empik.com/funko-pop,10030,s", { waitUntil: "domcontentloaded", timeout: 45000 });
        
        // Czekamy chwilę na załadowanie elementów listy
        await new Promise(r => setTimeout(r, 5000));

        const products = await page.evaluate(() => {
            const items = [];
            // Szukamy kontenerów produktów na liście
            const elements = document.querySelectorAll('div[data-product-id], li[data-product-id], .search-list-item, div.ta-prod-card');
            
            elements.forEach((el) => {
                const id = el.getAttribute('data-product-id') || el.getAttribute('data-id');
                const name = el.getAttribute('data-product-name') || el.querySelector('a.img-wrap')?.title || el.querySelector('a')?.innerText;
                const price = el.getAttribute('data-product-price');
                const linkEl = el.querySelector('a[href*="/p/"]');
                const merchantId = el.getAttribute('data-merchant-id');

                // Jeśli brak jawnego merchant-id, sprawdzamy tekst o sprzedawcy
                if (id && linkEl) {
                    items.push({ 
                        id, 
                        name: name ? name.trim().split('\n')[0] : 'Funko POP', 
                        price: price ? price : 'Brak ceny', 
                        url: linkEl.href.startsWith('http') ? linkEl.href : `https://www.empik.com${linkEl.href}` 
                    });
                }
            });

            // Awaryjny fallback: jeśli selektory strukturalne zawiodą, wyciągnij po samych linkach produktowych
            if (items.length === 0) {
                document.querySelectorAll('a[href*="/p/"]').forEach(a => {
                    if (a.href && a.href.includes('/p/')) {
                        items.push({
                            id: a.href.split('/p/')[1]?.split('?')[0] || a.href,
                            name: a.title || a.innerText || 'Funko POP',
                            price: 'Nieznana',
                            url: a.href
                        });
                    }
                });
            }

            return items;
        });

        // Usuwamy duplikaty po ID/URL
        const uniqueProducts = Array.from(new Set(products.map(p => p.url)))
            .map(url => products.find(p => p.url === url));

        console.log(`Znaleziono produktów na stronie: ${uniqueProducts.length}`);
        console.log(JSON.stringify(uniqueProducts.slice(0, 3), null, 2)); // Wypisuje pierwsze 3 sztuki w logach

        await browser.close();

        let updated = false;
        for (const p of uniqueProducts) {
            if (!history.includes(p.id)) {
                console.log(`Nowy produkt wykryty: ${p.name}`);
                await sendToDiscord(p);
                history.push(p.id);
                updated = true;
            }
        }

        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        console.log(`Zapisano plik historii. Łącznie unikalnych ID w bazie: ${history.length}`);

    } catch (error) {
        await browser.close();
        console.error("Błąd podczas skanowania:", error);
        process.exit(1);
    }
}

checkEmpik();
