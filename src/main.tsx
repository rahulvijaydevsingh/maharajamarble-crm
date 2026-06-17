// Polyfill crypto.randomUUID for non-secure contexts / older browsers
if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID !== 'function') {
  (crypto as any).randomUUID = function (): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r =
        typeof crypto !== 'undefined' && crypto.getRandomValues
          ? (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> (c === 'x' ? 0 : 1)
          : (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  };
}

import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Prevent Lovable script from overriding our favicon
const forceFavicon = () => {
  document.querySelectorAll("link[rel*='icon']").forEach((el) => {
    const href = (el as HTMLLinkElement).href || '';
    if (href.includes('lovable') || href.includes('gpteng')) {
      el.remove();
    }
  });
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/x-icon';
  link.href = '/favicon.ico';
  document.head.appendChild(link);
};
forceFavicon();
setTimeout(forceFavicon, 1000);

createRoot(document.getElementById("root")!).render(<App />);
