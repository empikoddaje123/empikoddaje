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
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
        ] 
    });
    
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1920, height: 1080 });

    let history = JSON.parse(fs.readFileSync(HISTORY_FILE));

    try {
        console.log("Otwieram wyszukiwarki Empiku...");
        // Używamy oficjalnego adresu wyszukiwania frazowego, który nie zwraca 404
        const response = await page.goto("https://www.empik.com/szukaj/produkt?q=funko+pop", { waitUntil: "domcontentloaded", timeout: 45000 });
        
        console.log(`Kod odpowiedzi HTTP: ${response.status()}`);
        
        // Czekamy na załadowanie elementów listy
        await new Promise(r => setTimeout(r, 5000));

        const products = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('a[href*="/p/"]').forEach(a => {
                const href = a.href;
                if (href && href.includes('/p/')) {
                    const cleanUrl = href.split('?')[0];
                    const idMatch = cleanUrl.match(/-p([0-9a-z]+)$/i) || cleanUrl.split('/p/')[1];
                    const id = typeof idMatch === 'string' ? idMatch : (idMatch ? idMatch[1] : cleanUrl);
                    
                    const name = a.getAttribute('title') || a.innerText;
                    if (name && name.trim().length > 3 && !items.some(i => i.url === cleanUrl)) {
                        items.push({
                            id: id,
                            name: name.trim().split('\n')[0],
                            price: 'Sprawdź',
                            url: cleanUrl
                        });
                    }
                }
            });
            return items;
        });

        console.log(`Znaleziono produktów na stronie: ${products.length}`);
        if (products.length > 0) {
            console.log(JSON.stringify(products.slice(0, 3), null, 2));
        }

        await browser.close();

        let updated = false;
        for (const p of products) {
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
