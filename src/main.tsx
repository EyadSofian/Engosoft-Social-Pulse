import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/shell.css';
import './styles/charts.css';
import './styles/views.css';
import './styles/calendar.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
