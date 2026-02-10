import React, { useEffect, useState } from 'react';
import './screenProtector.css';

// Best-effort deterrents against casual screen capture. Cannot fully prevent screenshots.
export default function ScreenProtector({ watermarkText }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState !== 'visible');
    const onBlur = () => setHidden(true);
    const onFocus = () => setHidden(false);
    const onContext = (e) => e.preventDefault();
    const onKey = (e) => {
      // Block print dialog (Ctrl/Cmd + P)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        e.stopPropagation();
      }
      // Detect PrintScreen key; briefly hide content (cannot guarantee)
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        setHidden(true);
        setTimeout(() => setHidden(false), 800);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="screen-protector-root" aria-hidden="true">
      <div className={`screen-protector-overlay ${hidden ? 'visible' : ''}`}></div>
      <div className="screen-protector-watermarks">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="screen-protector-watermark">{watermarkText}</div>
        ))}
      </div>
    </div>
  );
}
