/**
 * @file        splash.js
 * @module      ui
 * @summary     開場 Splash Screen；觸控裝置首先顯示 PWA 安裝引導，再選難度/輸入模式，呼叫 onStart(diffMode, inputMode)
 * @exports     showSplashScreen
 * @depends     src/ui/mobileLayout.js（isTouchDevice, isStandalone, getSavedInputMode, saveInputMode）
 *              src/ui/pwaTutorial.js（showPwaTutorial, shouldShowPwaTutorial）
 * @version     v0.0.13.0
 *
 * diffMode:  'normal' = 正式難度；'test' = 測試難度 1~30 關
 * inputMode: 'keyboard' = 電腦鍵盤；'touch' = 手機觸控
 * 輸入模式存 yesmaster.inputMode，不進遊戲存檔。
 */

import { isTouchDevice, isStandalone, getSavedInputMode, saveInputMode } from './mobileLayout.js';
import { showPwaTutorial, shouldShowPwaTutorial } from './pwaTutorial.js';

export function showSplashScreen(onStart) {
  if (isTouchDevice() && !isStandalone() && shouldShowPwaTutorial()) {
    showPwaTutorial(() => _buildSplashDOM(onStart));
    return;
  }
  _buildSplashDOM(onStart);
}

function _buildSplashDOM(onStart) {
  const splash = document.createElement('div');
  splash.id = 'splash-screen';
  splash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:9999;transition:opacity 0.8s ease;user-select:none;';

  const title = document.createElement('div');
  title.textContent = 'GOBLIN NEST';
  title.style.cssText = "font-family:Georgia,'Times New Roman',serif;font-size:clamp(28px,6vw,52px);font-weight:bold;letter-spacing:8px;color:#D4A017;text-shadow:2px 2px 0px #7a5500,4px 4px 0px #5a3e00,6px 6px 8px rgba(0,0,0,0.9);opacity:0;transform:translateY(6px);transition:opacity 1.2s ease,transform 1.2s ease;";

  const sub = document.createElement('div');
  sub.textContent = 'PRESENTS';
  sub.style.cssText = "font-family:Georgia,serif;font-size:clamp(10px,2vw,14px);letter-spacing:6px;color:rgba(212,160,23,0.6);opacity:0;transition:opacity 1.4s ease 0.3s;";

  // 第一排：難度選擇按鈕（淡入延遲 0.6s）
  const diffWrap = document.createElement('div');
  diffWrap.style.cssText = 'display:flex;gap:24px;margin-top:32px;opacity:0;transition:opacity 1.2s ease 0.6s;';

  // 第二排：輸入模式選擇（淡入延遲 0.8s）
  const inputWrap = document.createElement('div');
  inputWrap.style.cssText = 'display:flex;gap:16px;opacity:0;transition:opacity 1.2s ease 0.8s;';

  const inputLabel = document.createElement('div');
  inputLabel.textContent = '輸入模式：';
  inputLabel.style.cssText = 'color:rgba(212,160,23,0.7);font-size:12px;letter-spacing:1px;align-self:center;';

  // 預設輸入模式：已儲存的優先，否則 auto-detect
  let selectedInput = getSavedInputMode() ?? (isTouchDevice() ? 'touch' : 'keyboard');

  const mkInputBtn = (label, mode) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.mode = mode;
    const isSel = () => btn.dataset.mode === selectedInput;
    const applyStyle = () => {
      btn.style.cssText = isSel()
        ? 'padding:8px 18px;background:rgba(212,160,23,0.2);border:1px solid #D4A017;color:#D4A017;font-size:12px;letter-spacing:1px;cursor:pointer;outline:none;transition:background 0.2s,border-color 0.2s;'
        : 'padding:8px 18px;background:transparent;border:1px solid rgba(212,160,23,0.35);color:rgba(212,160,23,0.7);font-size:12px;letter-spacing:1px;cursor:pointer;outline:none;transition:background 0.2s,border-color 0.2s;';
    };
    applyStyle();
    btn.addEventListener('mouseover', () => { if (!isSel()) btn.style.background = 'rgba(212,160,23,0.08)'; });
    btn.addEventListener('mouseout',  () => { if (!isSel()) btn.style.background = 'transparent'; });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedInput = mode;
      inputWrap.querySelectorAll('button').forEach(b => {
        const sel = b.dataset.mode === selectedInput;
        b.style.background  = sel ? 'rgba(212,160,23,0.2)' : 'transparent';
        b.style.borderColor = sel ? '#D4A017' : 'rgba(212,160,23,0.35)';
        b.style.color       = sel ? '#D4A017' : 'rgba(212,160,23,0.7)';
      });
    });
    return btn;
  };

  inputWrap.appendChild(inputLabel);
  inputWrap.appendChild(mkInputBtn('⌨ 電腦鍵盤', 'keyboard'));
  inputWrap.appendChild(mkInputBtn('📱 手機觸控', 'touch'));

  // 難度按鈕：點了記住 inputMode 並觸發 onStart
  const makeDiffBtn = (label, diffMode) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = 'padding:10px 28px;background:transparent;border:1px solid rgba(212,160,23,0.45);color:#D4A017;font-size:13px;letter-spacing:2px;cursor:pointer;transition:background 0.2s,border-color 0.2s;outline:none;';
    btn.addEventListener('mouseover', () => { btn.style.background = 'rgba(212,160,23,0.12)'; btn.style.borderColor = '#D4A017'; });
    btn.addEventListener('mouseout',  () => { btn.style.background = 'transparent'; btn.style.borderColor = 'rgba(212,160,23,0.45)'; });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveInputMode(selectedInput);
      splash.style.opacity = '0';
      setTimeout(() => { splash.remove(); onStart(diffMode, selectedInput); }, 800);
    }, { once: true });
    return btn;
  };

  diffWrap.appendChild(makeDiffBtn('正式難度', 'normal'));
  diffWrap.appendChild(makeDiffBtn('測試模式  1~30 關', 'test'));

  if (!document.getElementById('_splash-style')) {
    const s = document.createElement('style');
    s.id = '_splash-style';
    s.textContent = '@keyframes _splashHint{0%,100%{opacity:.25}50%{opacity:.6}}';
    document.head.appendChild(s);
  }

  splash.appendChild(title);
  splash.appendChild(sub);
  splash.appendChild(diffWrap);
  splash.appendChild(inputWrap);
  document.body.appendChild(splash);

  requestAnimationFrame(() => {
    setTimeout(() => {
      title.style.opacity = '1';
      title.style.transform = 'translateY(0)';
      sub.style.opacity = '1';
      diffWrap.style.opacity = '1';
      inputWrap.style.opacity = '1';
    }, 100);
  });
}

