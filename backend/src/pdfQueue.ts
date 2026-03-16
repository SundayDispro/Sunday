import puppeteer from 'puppeteer';

type Job<T> = {
  run: (browser: puppeteer.Browser) => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

const MAX_CONCURRENCY = 2;
let activeBrowsers = 0;
const queue: Job<unknown>[] = [];

async function launchBrowser(): Promise<puppeteer.Browser> {
  return puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-pdf-viewer-hud'],
  });
}

async function processQueue(): Promise<void> {
  if (activeBrowsers >= MAX_CONCURRENCY) return;
  const job = queue.shift();
  if (!job) return;

  activeBrowsers += 1;
  let browser: puppeteer.Browser | null = null;

  try {
    browser = await launchBrowser();
    const result = await job.run(browser);
    job.resolve(result);
  } catch (err) {
    job.reject(err);
  } finally {
    activeBrowsers -= 1;
    try {
      await browser?.close();
    } catch {
      // ignore
    }
    void processQueue();
  }
}

export function enqueuePdfTask<T>(run: (browser: puppeteer.Browser) => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ run, resolve, reject });
    void processQueue();
  });
}

