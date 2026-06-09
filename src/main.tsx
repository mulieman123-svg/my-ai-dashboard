import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Perform React application mounting
const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  // Successfully loaded! Hide the bootstrap loading overlay gracefully
  try {
    const loader = document.getElementById('loader-container');
    if (loader) {
      loader.classList.add('fade-out');
      // Give the CSS opacity transition a short window to finish before removing it from DOM
      setTimeout(() => {
        if (loader.parentNode) {
          loader.parentNode.removeChild(loader);
        } else {
          loader.style.display = 'none';
        }
      }, 500);
    }
  } catch (error) {
    console.warn("Could not transition bootstrap loader:", error);
  }
}

