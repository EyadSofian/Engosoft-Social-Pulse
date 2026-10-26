import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/pages.css';
import './styles/post-designer.css';
import './styles/creation-home.css';
import './legacy/styles/legacy-base.css';
import './legacy/styles/ui.css';
import './legacy/styles/views.css';
import './legacy/styles/calendar.css';
import './styles/glass.css';
import './styles/motion.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
