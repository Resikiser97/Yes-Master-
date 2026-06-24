/**
 * @file        splash.js
 * @module      ui
 * @summary     開場 Splash Screen；點擊後呼叫 onStart callback
 * @exports     showSplashScreen
 * @depends     （無）
 * @version     v0.0.6.0
 */

export function showSplashScreen(onStart) {
  const splash = document.createElement('div');
  splash.id = 'splash-screen';
  splash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:9999;cursor:pointer;transition:opacity 0.8s ease;user-select:none;';

  const title = document.createElement('div');
  title.textContent = 'GOBLIN NEST';
  title.style.cssText = "font-family:Georgia,'Times New Roman',serif;font-size:clamp(28px,6vw,52px);font-weight:bold;letter-spacing:8px;color:#D4A017;text-shadow:2px 2px 0px #7a5500,4px 4px 0px #5a3e00,6px 6px 8px rgba(0,0,0,0.9);opacity:0;transform:translateY(6px);transition:opacity 1.2s ease,transform 1.2s ease;";

  const sub = document.createElement('div');
  sub.textContent = 'PRESENTS';
  sub.style.cssText = "font-family:Georgia,serif;font-size:clamp(10px,2vw,14px);letter-spacing:6px;color:rgba(212,160,23,0.6);opacity:0;transition:opacity 1.4s ease 0.3s;";

  const hint = document.createElement('div');
  hint.textContent = '點擊任意處繼續';
  hint.style.cssText = 'position:absolute;bottom:36px;font-size:12px;color:rgba(255,255,255,0.25);letter-spacing:2px;animation:_splashHint 2s ease-in-out infinite;';

  if (!document.getElementById('_splash-style')) {
    const s = document.createElement('style');
    s.id = '_splash-style';
    s.textContent = '@keyframes _splashHint{0%,100%{opacity:.25}50%{opacity:.6}}';
    document.head.appendChild(s);
  }

  splash.appendChild(title);
  splash.appendChild(sub);
  splash.appendChild(hint);
  document.body.appendChild(splash);

  requestAnimationFrame(() => {
    setTimeout(() => {
      title.style.opacity = '1';
      title.style.transform = 'translateY(0)';
      sub.style.opacity = '1';
    }, 100);
  });

  splash.addEventListener('click', () => {
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.remove();
      onStart();
    }, 800);
  }, { once: true });
}
