import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../design/tokens.css';
import './page.css';
import { Output } from './Output';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Output />
  </StrictMode>,
);
