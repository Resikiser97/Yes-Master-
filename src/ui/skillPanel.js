/**
 * @file        skillPanel.js
 * @module      ui
 * @summary     技能點升級 overlay：六屬性技能等級、金幣費用、一鍵升級
 * @exports     SkillPanel
 * @depends     config/economyConfig.js, config/gameConfig.js,
 *              src/account/walletService.js, src/account/skillService.js
 * @version     v0.0.23.0
 */

import { ECONOMY } from '../../config/economyConfig.js';
import { GAME_CONFIG } from '../../config/gameConfig.js';
import { skillService } from '../account/skillService.js';
import { WalletService } from '../account/walletService.js';

const OVERLAY_ID = 'skill-overlay';
const GOLD_BALANCE_ID = 'skill-gold-balance';
const LIST_ID = 'skill-list';
const TOAST_ID = 'skill-toast';
const HIDDEN_CLASS = 'hidden';

export class SkillPanel {
  constructor(container) {
    this.container = container ?? document.body;
    this.overlay = null;
    this.toastTimer = null;
  }

  show() {
    this.ensureOverlay();
    this.render();
    this.overlay.style.display = 'flex';
    this.overlay.classList.remove(HIDDEN_CLASS);
  }

  hide() {
    if (this.overlay) this.overlay.style.display = 'none';
    this.overlay?.classList.add(HIDDEN_CLASS);
  }

  ensureOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      this.overlay = existing;
      return;
    }

    this.overlay = el('div', { id: OVERLAY_ID, class: `overlay ${HIDDEN_CLASS}` });
    this.overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);display:none;align-items:center;justify-content:center;z-index:10003;font-family:sans-serif;color:#eee;';
    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) this.hide();
    });

    const panel = el('div', { class: 'overlay-panel' });
    panel.style.cssText = 'position:relative;width:min(720px,94vw);max-height:88vh;overflow:auto;background:#101010;color:#eee;border:1px solid rgba(212,160,23,0.55);box-shadow:0 18px 48px rgba(0,0,0,0.5);border-radius:6px;padding:20px;box-sizing:border-box;';

    const toast = el('div', { id: TOAST_ID });
    toast.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);padding:7px 12px;border:1px solid rgba(212,160,23,0.55);background:rgba(0,0,0,0.86);color:#f4d37b;border-radius:4px;font-size:12px;opacity:0;pointer-events:none;transition:opacity 0.2s;';

    const title = el('h2', { textContent: '⚡ 技能點' });
    title.style.cssText = 'margin:0 0 10px;color:#D4A017;font-family:Georgia,serif;font-size:24px;letter-spacing:2px;text-align:center;';

    const goldBalance = el('div', { id: GOLD_BALANCE_ID });
    goldBalance.style.cssText = 'margin-bottom:14px;color:#f4d37b;font-size:13px;text-align:center;';

    const list = el('div', { id: LIST_ID });
    list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:14px;';

    const actions = el('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;';
    const close = el('button', { textContent: '關閉' });
    close.style.cssText = buttonStyle();
    close.addEventListener('click', () => this.hide());
    actions.appendChild(close);

    panel.append(toast, title, goldBalance, list, actions);
    this.overlay.appendChild(panel);
    this.container.appendChild(this.overlay);
  }

  render() {
    const wallet = WalletService.getWallet();
    const levels = skillService.getLevels();
    const goldBalance = this.overlay.querySelector(`#${GOLD_BALANCE_ID}`);
    goldBalance.textContent = `💰 金幣：${formatNumber(wallet.gold)}`;

    const list = this.overlay.querySelector(`#${LIST_ID}`);
    list.replaceChildren();
    for (const attribute of ECONOMY.skills.attributes) {
      list.appendChild(this.renderSkill(attribute, levels[attribute.key] ?? 0, wallet));
    }
  }

  renderSkill(attribute, level, wallet) {
    const maxLevel = GAME_CONFIG.skill.maxLevel;
    const cost = skillService.getUpgradeCost(attribute.key);
    const canUpgrade = skillService.canUpgrade(attribute.key, wallet);
    const percent = maxLevel > 0 ? Math.min(100, Math.max(0, (level / maxLevel) * 100)) : 0;

    const block = el('section');
    block.style.cssText = 'border:1px solid rgba(212,160,23,0.35);background:rgba(255,255,255,0.045);border-radius:6px;padding:12px;box-sizing:border-box;min-height:142px;';

    const header = el('div');
    header.style.cssText = 'display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:9px;';
    const name = el('div', { textContent: attribute.name });
    name.style.cssText = 'font-size:15px;color:#fff;font-weight:bold;';
    const levelText = el('div', { textContent: `Lv ${level} / ${maxLevel}` });
    levelText.style.cssText = 'font-size:12px;color:#f4d37b;';
    header.append(name, levelText);

    const track = el('div');
    track.style.cssText = 'height:8px;background:rgba(255,255,255,0.11);border:1px solid rgba(212,160,23,0.28);border-radius:4px;overflow:hidden;margin-bottom:9px;';
    const bar = el('div');
    bar.style.cssText = 'height:100%;background:#D4A017;width:0%;transition:width 0.16s;';
    bar.style.width = `${percent}%`;
    track.appendChild(bar);

    const costText = el('div', {
      textContent: cost === null ? '已滿等' : `升至 Lv${level + 1}：${formatNumber(cost)} 金幣`,
    });
    costText.style.cssText = 'min-height:18px;margin-bottom:10px;color:#ccc;font-size:12px;';

    const upgrade = el('button', { textContent: '升級' });
    upgrade.style.cssText = buttonStyle();
    upgrade.disabled = !canUpgrade;
    if (!canUpgrade) {
      upgrade.style.opacity = '0.45';
      upgrade.style.cursor = 'not-allowed';
      upgrade.title = cost === null ? '已滿等' : '金幣不足';
    }
    upgrade.addEventListener('click', () => this.upgrade(attribute.key));

    block.append(header, track, costText, upgrade);
    return block;
  }

  upgrade(key) {
    const wallet = WalletService.getWallet();
    if (!skillService.canUpgrade(key, wallet)) return;

    const currentLevel = skillService.getLevel(key);
    const cost = skillService.getUpgradeCost(key);
    if (cost === null) return;

    const result = WalletService.spendWallet({
      source: 'skill',
      reason: 'upgrade',
      cost: { gold: cost },
      idempotencyKey: `skill-upgrade:local:${key}:lv${currentLevel + 1}`,
    });

    if (result.ok === false && !result.duplicate) {
      this.showToast('金幣不足');
      return;
    }

    // duplicate:true 表示扣款交易已存在，但技能等級可能還沒寫入。
    // 繼續 setLevel 是刻意保留的 crash window recovery。
    skillService.setLevel(key, currentLevel + 1);
    this.showToast('技能已升級');
    this.render();
  }

  showToast(message) {
    const toast = this.overlay?.querySelector(`#${TOAST_ID}`);
    if (!toast) return;

    toast.textContent = message;
    toast.style.opacity = '1';
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
    }, 3000);
  }
}

function buttonStyle() {
  return 'padding:8px 12px;border:1px solid rgba(212,160,23,0.55);background:rgba(212,160,23,0.12);color:#f4d37b;border-radius:4px;font-size:12px;cursor:pointer;';
}

function formatNumber(value) {
  return Number(value).toLocaleString('en-US');
}

function el(tag, props = {}) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'textContent') node.textContent = value;
    else node.setAttribute(key, value);
  });
  return node;
}
