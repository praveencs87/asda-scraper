import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput() || {};
const { startUrls = [], maxItems = 100, proxyConfig } = input;

const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);

let itemCount = 0;

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxConcurrency: 5,
    requestHandlerTimeoutSecs: 60,
    requestHandler: async ({ request, page, log }) => {
        log.info(`Processing ${request.url}...`);

        try { await page.waitForSelector('li, [class*="product"], [class*="item"]', { timeout: 10000 }); } catch (e) {
            log.warning('Could not find products within timeout.');
        }

        const items = await page.$$eval('li, [class*="product"], [class*="item"]', (elements) => {
            return elements.map(el => {
                const titleEl = el.querySelector('h2, h3, a[href*="/product/"], [class*="title"]');
                const linkEl = el.querySelector('a[href*="/product/"], a');
                const priceEl = el.querySelector('[class*="price"], strong');
                const weightEl = el.querySelector('[class*="weight"], [class*="volume"]');
                
                return {
                    url: linkEl ? linkEl.href : location.href,
                    title: titleEl ? titleEl.innerText.trim() : el.innerText.split('\n')[0].trim(),
                    price: priceEl ? priceEl.innerText.trim() : null,
                    weight: weightEl ? weightEl.innerText.trim() : null
                };
            }).filter(c => c.title.length > 0 && c.url && c.title !== c.url);
        });

        const validItems = items.filter(item => item.price);

        const itemsToExtract = [];
        for (const item of validItems) {
            if (itemCount >= maxItems) break;
            itemsToExtract.push(item);
            itemCount++;
        }

        if (itemsToExtract.length > 0) {
            await Actor.pushData(itemsToExtract);
            log.info(`Pushed ${itemsToExtract.length} products to dataset.`);
        } else {
            log.warning('No valid products found on this page.');
        }
    },
    failedRequestHandler: ({ request, log }) => {
        log.error(`Request ${request.url} failed too many times.`);
    },
});

const initialRequests = [];

if (startUrls && startUrls.length > 0) {
    for (const req of startUrls) {
        initialRequests.push(typeof req === 'string' ? req : req.url);
    }
} else {
    log.warning('No startUrls provided. Using default.');
    initialRequests.push('https://groceries.asda.com/search/milk');
}

if (initialRequests.length > 0) {
    await crawler.run(initialRequests);
}

await Actor.exit();
