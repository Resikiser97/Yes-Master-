/**
 * @file        pwaTutorial.js
 * @module      ui
 * @summary     PWA 安裝引導畫面；教 iOS/Android 玩家如何加入主畫面以移除地址欄
 * @exports     showPwaTutorial, shouldShowPwaTutorial
 * @depends     （無）
 * @version     v0.0.18.0
 *
 * localStorage key：yesmaster.pwaSkip（整數 0~3，≥3 不再顯示）
 * 顯示條件由呼叫端控制（isTouchDevice && !isStandalone && shouldShowPwaTutorial）
 */

const PWA_SKIP_KEY = 'yesmaster.pwaSkip';
const MAX_SKIP = 3;

let _deferredPrompt = null;

// 攔截 Android Chrome 的原生安裝提示，留給按鈕手動觸發
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;
  });
}

function getSkipCount() {
  try { return Math.max(0, parseInt(localStorage.getItem(PWA_SKIP_KEY) ?? '0', 10) || 0); } catch { return 0; }
}
function setSkipCount(n) {
  try { localStorage.setItem(PWA_SKIP_KEY, String(n)); } catch {}
}

export function shouldShowPwaTutorial() {
  return getSkipCount() < MAX_SKIP;
}

export function showPwaTutorial(onDone) {
  if (!shouldShowPwaTutorial()) { onDone(); return; }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase());
  let activeTab = isIOS ? 'ios' : 'android';

  // ── 外層容器 ──────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'pwa-tutorial';
  overlay.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
    'background:rgba(0,0,0,0.96)', 'z-index:9998',
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
    'gap:14px', 'padding:20px 16px', 'box-sizing:border-box',
    'color:#eee', 'font-family:sans-serif',
    'opacity:0', 'transition:opacity 0.4s ease',
    'overflow-y:auto',
  ].join(';');

  // ── 標題 ──────────────────────────────────────────────
  const title = document.createElement('div');
  title.textContent = '📲 加入主畫面，獲得更佳遊戲體驗';
  title.style.cssText = 'font-size:clamp(14px,3.5vw,20px);font-weight:bold;color:#D4A017;text-align:center;letter-spacing:1px;';

  const subtitle = document.createElement('div');
  subtitle.textContent = '移除地址欄，全螢幕橫向遊玩';
  subtitle.style.cssText = 'font-size:clamp(11px,2.5vw,13px);color:rgba(212,160,23,0.55);text-align:center;margin-top:-6px;';

  // ── 分頁列 ────────────────────────────────────────────
  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;border:1px solid rgba(212,160,23,0.35);border-radius:6px;overflow:hidden;';

  const applyTabStyles = () => {
    tabBar.querySelectorAll('button[data-tab]').forEach(b => {
      const active = b.dataset.tab === activeTab;
      b.style.background = active ? 'rgba(212,160,23,0.2)' : 'transparent';
      b.style.color      = active ? '#D4A017' : 'rgba(212,160,23,0.45)';
    });
  };

  const mkTab = (label, tabId) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.tab = tabId;
    btn.style.cssText = [
      'padding:7px 20px', 'font-size:clamp(11px,2.5vw,13px)', 'letter-spacing:1px',
      'cursor:pointer', 'border:none', 'outline:none',
      'transition:background 0.2s,color 0.2s',
      'touch-action:manipulation', '-webkit-tap-highlight-color:transparent',
    ].join(';');
    btn.addEventListener('click', () => { activeTab = tabId; applyTabStyles(); updateSteps(); });
    return btn;
  };

  tabBar.appendChild(mkTab('🍎 iOS (Safari)', 'ios'));
  tabBar.appendChild(mkTab('🤖 Android (Chrome)', 'android'));
  applyTabStyles();

  // ── 步驟區 ────────────────────────────────────────────
  const stepsBox = document.createElement('div');
  stepsBox.style.cssText = [
    'border:1px solid rgba(212,160,23,0.18)', 'border-radius:8px',
    'padding:14px 18px', 'background:rgba(212,160,23,0.04)',
    'max-width:480px', 'width:100%', 'box-sizing:border-box',
  ].join(';');

  const IOS_STEPS = [
    { icon: '⬆', text: '在 Safari 底部點擊「分享」按鈕（方框箭頭 □↑）' },
    { icon: '📋', text: '往下捲動選單，找到「加入主畫面」' },
    { icon: '✅', text: '點「新增」確認，之後從主畫面開啟即全螢幕遊玩！' },
  ];
  const ANDROID_STEPS = [
    { icon: '⋮',  text: '在 Chrome 右上角點擊「選單」（三個點 ⋮）' },
    { icon: '📲', text: '選擇「新增至主畫面」或「安裝應用程式」' },
    { icon: '✅', text: '點「新增」確認，之後從主畫面開啟即全螢幕遊玩！' },
  ];

  const updateSteps = () => {
    stepsBox.innerHTML = '';
    const steps = activeTab === 'ios' ? IOS_STEPS : ANDROID_STEPS;

    steps.forEach(({ icon, text }, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:flex-start;gap:12px;' + (i < steps.length - 1 ? 'margin-bottom:12px;' : '');

      const badge = document.createElement('div');
      badge.textContent = icon;
      badge.style.cssText = [
        'min-width:30px', 'height:30px', 'border-radius:50%',
        'background:rgba(212,160,23,0.15)', 'border:1px solid rgba(212,160,23,0.4)',
        'display:flex', 'align-items:center', 'justify-content:center',
        'font-size:14px', 'flex-shrink:0', 'color:#D4A017',
      ].join(';');

      const label = document.createElement('div');
      label.style.cssText = 'font-size:clamp(12px,2.5vw,14px);line-height:1.6;color:#ddd;padding-top:5px;';
      label.textContent = `${i + 1}. ${text}`;

      row.appendChild(badge);
      row.appendChild(label);
      stepsBox.appendChild(row);
    });

    // Android：有原生安裝 prompt 時顯示自動引導按鈕
    if (activeTab === 'android' && _deferredPrompt) {
      const promptBtn = document.createElement('button');
      promptBtn.textContent = '🚀 讓瀏覽器自動引導安裝';
      promptBtn.style.cssText = [
        'margin-top:12px', 'width:100%', 'padding:9px',
        'background:rgba(212,160,23,0.12)', 'border:1px solid rgba(212,160,23,0.45)',
        'color:#D4A017', 'font-size:13px', 'cursor:pointer', 'border-radius:4px',
        'letter-spacing:1px', 'outline:none',
        'touch-action:manipulation', '-webkit-tap-highlight-color:transparent',
      ].join(';');
      promptBtn.addEventListener('click', async () => {
        if (!_deferredPrompt) return;
        _deferredPrompt.prompt();
        const { outcome } = await _deferredPrompt.userChoice;
        _deferredPrompt = null;
        if (outcome === 'accepted') { setSkipCount(0); dismiss(); }
      });
      stepsBox.appendChild(promptBtn);
    }
  };

  // ── 動作按鈕 ──────────────────────────────────────────
  const btnWrap = document.createElement('div');
  btnWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:4px;';

  const doneBtn = document.createElement('button');
  doneBtn.textContent = '✅ 已加入主畫面，開始遊玩';
  doneBtn.style.cssText = [
    'padding:10px 28px',
    'background:rgba(212,160,23,0.18)', 'border:1px solid #D4A017',
    'color:#D4A017', 'font-size:clamp(12px,2.5vw,14px)', 'letter-spacing:1px',
    'cursor:pointer', 'border-radius:4px', 'outline:none',
    'touch-action:manipulation', '-webkit-tap-highlight-color:transparent',
  ].join(';');
  doneBtn.addEventListener('click', () => { setSkipCount(0); dismiss(); });

  const skipBtn = document.createElement('button');
  skipBtn.textContent = '先跳過，繼續瀏覽器遊玩';
  skipBtn.style.cssText = [
    'padding:6px 16px', 'background:transparent', 'border:none',
    'color:rgba(212,160,23,0.38)', 'font-size:11px', 'cursor:pointer',
    'letter-spacing:1px', 'outline:none',
    'touch-action:manipulation', '-webkit-tap-highlight-color:transparent',
  ].join(';');
  skipBtn.addEventListener('click', () => { setSkipCount(getSkipCount() + 1); dismiss(); });

  const remaining = MAX_SKIP - getSkipCount() - 1;
  btnWrap.appendChild(doneBtn);
  btnWrap.appendChild(skipBtn);
  if (remaining > 0) {
    const hint = document.createElement('div');
    hint.textContent = `再跳過 ${remaining} 次後不再提醒`;
    hint.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.18);';
    btnWrap.appendChild(hint);
  }

  // ── 組裝並插入 ────────────────────────────────────────
  overlay.appendChild(title);
  overlay.appendChild(subtitle);
  overlay.appendChild(tabBar);
  overlay.appendChild(stepsBox);
  overlay.appendChild(btnWrap);
  document.body.appendChild(overlay);

  updateSteps();
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });

  const dismiss = () => {
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.remove(); onDone(); }, 400);
  };
}

