import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import './styles/tokens.css';
import App from './App.jsx';
import { TripProvider } from './context/TripContext.jsx';
import { queryClient } from './lib/queryClient.js';
import { initAnalytics } from './lib/analytics.js';

initAnalytics();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/app">
      <QueryClientProvider client={queryClient}>
        <TripProvider>
          <App />
        </TripProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
