const puppeteer = require('puppeteer');

async function checkEmpik() {
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

    try {
        console.log("Wysyłam żądanie do Empiku...");
        const response = await page.goto("https://www.empik.com/funko-pop,10030,s", { waitUntil: "domcontentloaded", timeout: 45000 });
        
        console.log(`Kod odpowiedzi HTTP: ${response.status()}`);
        console.log(`Tytuł strony: ${await page.title()}`);

        // Pobieramy fragment kodu HTML, żeby zobaczyć czy to blokada czy pusta strona
        const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 300));
        console.log("Fragment treści strony:", bodySnippet);

        await browser.close();
    } catch (error) {
        console.error("Błąd:", error);
        await browser.close();
    }
}

checkEmpik();
