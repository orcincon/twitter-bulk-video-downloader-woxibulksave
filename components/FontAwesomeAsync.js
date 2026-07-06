'use client';

import { useEffect } from 'react';

const FA_URL = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css';

/** Non-render-blocking FontAwesome load for better LCP. */
export default function FontAwesomeAsync() {
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FA_URL;
    link.media = 'print';
    link.onload = () => { link.media = 'all'; };
    document.head.appendChild(link);
  }, []);
  return null;
}
