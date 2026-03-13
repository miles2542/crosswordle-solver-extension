import { mount } from 'svelte';
import App from './ui/App.svelte';

const container = document.createElement('div');
container.id = 'tactile-extension-root';
container.style.position = 'fixed';
container.style.inset = '0';
container.style.zIndex = '999999';
container.style.pointerEvents = 'none';
document.body.appendChild(container);

const shadow = container.attachShadow({ mode: 'open' });
const target = document.createElement('div');
target.id = 'tactile-app-root';
target.style.position = 'absolute';
target.style.inset = '0';
target.style.pointerEvents = 'none'; 
shadow.appendChild(target);

// --- Robust Style Injection (Inlined via Fetch) ---
async function injectStyles() {
    const manifest = chrome.runtime.getManifest();
    const contentScripts = manifest.content_scripts || [];
    
    // Collect all manifest CSS URLs
    const cssUrls: string[] = [];
    for (const script of contentScripts) {
        if (script.css) {
            for (const cssFile of script.css) {
                cssUrls.push(chrome.runtime.getURL(cssFile));
            }
        }
    }

    // 1. Fetch each CSS file and inject as <style> tag
    for (const url of cssUrls) {
        try {
            const resp = await fetch(url);
            if (resp.ok) {
                const cssText = await resp.text();
                const style = document.createElement('style');
                style.textContent = cssText;
                shadow.appendChild(style);
                console.log(`[Tactile] Injected style: ${url.split('/').pop()}`);
            }
        } catch (e) {
            console.error(`[Tactile] Failed to fetch style: ${url}`, e);
        }
    }

    // 2. Observer for runtime styles (HMR / Vite injects)
    const styleObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof HTMLStyleElement) {
                    shadow.appendChild(node.cloneNode(true));
                }
            }
        }
    });
    styleObserver.observe(document.head, { childList: true });

    // 3. One-time sweep of current styles
    document.head.querySelectorAll('style').forEach((st) => {
        shadow.appendChild(st.cloneNode(true));
    });
}

injectStyles();

// Svelte 5 mount
mount(App, { target });




