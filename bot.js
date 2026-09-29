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
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    let history = [];
    if (fs.existsSync(HISTORY_FILE)) {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE));
    }

    try {
        await page.goto("https://www.empik.com/funko-pop,10030,s", { waitUntil: "domcontentloaded", timeout: 30000 });

        const products = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('.search-list-item').forEach((el) => {
                if (el.getAttribute('data-merchant-id') !== "0") return; // Tylko czysty Empik
                const id = el.getAttribute('data-product-id');
                const name = el.getAttribute('data-product-name');
                const price = el.getAttribute('data-product-price');
                const linkEl = el.querySelector('a[href*="/p/"]');
                if (id && name && linkEl) {
                    items.push({ id, name, price: price ? parseFloat(price) : null, url: linkEl.href });
                }
            });
            return items;
        });

        await browser.close();

        let newFound = false;
        for (const p of products) {
            if (!history.includes(p.id)) {
                console.log(`Nowy produkt: ${p.name}`);
                await sendToDiscord(p);
                history.push(p.id);
                newFound = true;
            }
        }

        if (newFound) {
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        }

    } catch (error) {
        await browser.close();
        console.error("Błąd:", error);
    }
}

checkEmpik();
