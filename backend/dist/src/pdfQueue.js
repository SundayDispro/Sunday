"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueuePdfTask = enqueuePdfTask;
const puppeteer_1 = __importDefault(require("puppeteer"));
const MAX_CONCURRENCY = 2;
let activeBrowsers = 0;
const queue = [];
async function launchBrowser() {
    return puppeteer_1.default.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-pdf-viewer-hud'],
    });
}
async function processQueue() {
    if (activeBrowsers >= MAX_CONCURRENCY)
        return;
    const job = queue.shift();
    if (!job)
        return;
    activeBrowsers += 1;
    let browser = null;
    try {
        browser = await launchBrowser();
        const result = await job.run(browser);
        job.resolve(result);
    }
    catch (err) {
        job.reject(err);
    }
    finally {
        activeBrowsers -= 1;
        try {
            await browser?.close();
        }
        catch {
            // ignore
        }
        void processQueue();
    }
}
function enqueuePdfTask(run) {
    return new Promise((resolve, reject) => {
        queue.push({ run, resolve, reject });
        void processQueue();
    });
}
