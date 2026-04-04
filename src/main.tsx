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
