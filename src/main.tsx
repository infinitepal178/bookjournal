import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

async function start() {
  // The demo build (vite --mode demo) swaps GitHub for an in-memory repo of made-up
  // sample data. In the normal build this branch and the demo code are removed.
  if (import.meta.env.MODE === 'demo') await (await import('./demo')).installDemo();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
start();
