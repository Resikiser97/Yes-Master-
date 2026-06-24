"""
recrop_sprites.py — Spritesheet 重新裁剪 + 去背 + 置中

問題：Codex 上一次裁剪沒有去背，且各幀沒有置中。
做法：
  1. 邊界 flood-fill 找背景色（從四角連通的近白/灰色像素）
  2. 去除背景 → RGBA 透明
  3. 找每幀的 content bounding box
  4. 在正方形畫布置中輸出（加 10% padding）
  5. 覆蓋寫回 assets/ 對應目錄

依賴：Pillow（pip install pillow）
執行：python tools/recrop_sprites.py
"""

from PIL import Image
import numpy as np
import os, struct, collections

# ── 設定表 ────────────────────────────────────────────────────────────────────

SHEETS = [
    {
        "src":    "assets/spritesheet_enemies_shield-muscle-leader_3row4col.png",
        "rows":   3, "cols": 4,
        "names": [
            ["shield_walk_f0", "shield_walk_f1", "shield_walk_f2", "shield_walk_f3"],
            ["muscle_walk_f0", "muscle_walk_f1", "muscle_walk_f2", "muscle_walk_f3"],
            ["leader_walk_f0", "leader_walk_f1", "leader_walk_f2", "leader_walk_f3"],
        ],
        "out": "assets/enemies",
    },
    {
        "src":    "assets/spritesheet_goblin_3row4col_walk-walk-mine.png",
        "rows":   3, "cols": 4,
        "names": [
            ["goblin_walk_right_f0", "goblin_walk_right_f1", "goblin_walk_right_f2", "goblin_walk_right_f3"],
            ["goblin_walk_left_f0",  "goblin_walk_left_f1",  "goblin_walk_left_f2",  "goblin_walk_left_f3"],
            ["goblin_mine_f0",       "goblin_mine_f1",       "goblin_mine_f2",       "goblin_mine_f3"],
        ],
        "out": "assets/characters/goblin",
    },
    {
        "src":    "assets/spritesheet_core_orb_3row4col_normal-hit-lowhp.png",
        "rows":   3, "cols": 4,
        "names": [
            ["core_normal_f0", "core_normal_f1", "core_normal_f2", "core_normal_f3"],
            ["core_hit_f0",    "core_hit_f1",    "core_hit_f2",    "core_hit_f3"],
            ["core_lowhp_f0",  "core_lowhp_f1",  "core_lowhp_f2",  "core_lowhp_f3"],
        ],
        "out": "assets/core",
    },
    {
        "src":    "assets/spritesheet_enemy_civilian_2x2_walk.png",
        "rows":   2, "cols": 2,
        "names": [
            ["civilian_walk_f0", "civilian_walk_f1"],
            ["civilian_walk_f2", "civilian_walk_f3"],
        ],
        "out": "assets/enemies",
    },
    {
        "src":    "assets/spritesheet_ui_icons_12pack_4x3grid.png",
        "rows":   3, "cols": 4,
        "names": [
            ["icon_gold-coin",     "icon_silver-coin",   "icon_diamond-gem", "icon_ticket"],
            ["icon_settings-gear", "icon_trophy",        "icon_handshake",   "icon_backpack"],
            ["icon_slot-empty",    "icon_slot-selected", "icon_crown",       "icon_red-dot"],
        ],
        "out": "assets/ui",
    },
]

# 去背：容差（0~255），越高越激進
BG_TOLERANCE = 40
# 輸出邊距比例（相對於 content 最長邊）
PADDING_RATIO = 0.10
# 最小輸出尺寸
MIN_SIZE = 64


# ── 去背核心 ──────────────────────────────────────────────────────────────────

def remove_background(img: Image.Image) -> Image.Image:
    """
    從圖片四個角 flood-fill，移除與邊界連通且接近白/灰的背景像素。
    回傳帶 alpha 通道的 RGBA 圖片。
    """
    img = img.convert("RGBA")
    data = np.array(img, dtype=np.uint8)  # shape: (H, W, 4)
    H, W = data.shape[:2]

    # 以四角像素的 RGB 均值作為「背景色樣本」
    corners = [
        data[0, 0, :3], data[0, W-1, :3],
        data[H-1, 0, :3], data[H-1, W-1, :3],
    ]
    bg_color = np.mean(corners, axis=0)  # (R, G, B)

    # BFS flood-fill 從四角出發，標記背景 mask
    visited = np.zeros((H, W), dtype=bool)
    queue = collections.deque()

    def is_bg(r, c):
        if visited[r, c]:
            return False
        pixel = data[r, c, :3].astype(float)
        dist = np.linalg.norm(pixel - bg_color)
        return dist <= BG_TOLERANCE

    seeds = [(0, 0), (0, W-1), (H-1, 0), (H-1, W-1)]
    for sr, sc in seeds:
        if is_bg(sr, sc):
            queue.append((sr, sc))
            visited[sr, sc] = True

    while queue:
        r, c = queue.popleft()
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < H and 0 <= nc < W and is_bg(nr, nc):
                visited[nr, nc] = True
                queue.append((nr, nc))

    # 把背景設成透明
    result = data.copy()
    result[visited, 3] = 0
    return Image.fromarray(result, "RGBA")


def crop_and_center(img: Image.Image, output_size: int | None = None) -> Image.Image:
    """
    找 content bounding box（alpha > 10 的像素），加 padding，置中輸出正方形。
    output_size 若為 None 則自動計算。
    """
    arr = np.array(img)
    alpha = arr[:, :, 3]
    rows = np.any(alpha > 10, axis=1)
    cols = np.any(alpha > 10, axis=0)

    if not rows.any():
        # 完全透明幀 → 回傳空白正方形
        sz = output_size or MIN_SIZE
        return Image.new("RGBA", (sz, sz), (0, 0, 0, 0))

    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    content_h = rmax - rmin + 1
    content_w = cmax - cmin + 1

    max_dim = max(content_w, content_h)
    pad = max(2, round(max_dim * PADDING_RATIO))
    canvas_size = output_size or max(MIN_SIZE, max_dim + pad * 2)

    out = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    content = img.crop((cmin, rmin, cmax + 1, rmax + 1))
    # 若 content 比 canvas 大，縮小但保持比例
    if content_w > canvas_size - pad * 2 or content_h > canvas_size - pad * 2:
        scale = (canvas_size - pad * 2) / max(content_w, content_h)
        new_w = max(1, round(content_w * scale))
        new_h = max(1, round(content_h * scale))
        content = content.resize((new_w, new_h), Image.LANCZOS)
        content_w, content_h = new_w, new_h

    paste_x = (canvas_size - content_w) // 2
    paste_y = (canvas_size - content_h) // 2
    out.paste(content, (paste_x, paste_y), content)
    return out


# ── 主流程 ────────────────────────────────────────────────────────────────────

def process_sheet(sheet: dict, base_dir: str):
    src_path = os.path.join(base_dir, sheet["src"])
    out_dir  = os.path.join(base_dir, sheet["out"])
    rows, cols = sheet["rows"], sheet["cols"]
    names = sheet["names"]

    if not os.path.exists(src_path):
        print(f"  [SKIP] 找不到來源：{src_path}")
        return

    os.makedirs(out_dir, exist_ok=True)
    img = Image.open(src_path).convert("RGBA")
    W, H = img.size
    fw = W // cols
    fh = H // rows

    print(f"  來源：{sheet['src']}  ({W}×{H})  幀尺寸：{fw}×{fh}")

    # 先算出所有幀去背後的最大 content 尺寸，讓輸出統一大小
    all_frames = []
    max_content = MIN_SIZE
    for r in range(rows):
        for c in range(cols):
            frame = img.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh))
            clean = remove_background(frame)
            arr   = np.array(clean)
            alpha = arr[:, :, 3]
            rs = np.any(alpha > 10, axis=1)
            cs = np.any(alpha > 10, axis=0)
            if rs.any() and cs.any():
                rmin, rmax = np.where(rs)[0][[0, -1]]
                cmin, cmax = np.where(cs)[0][[0, -1]]
                max_content = max(max_content, rmax - rmin + 1, cmax - cmin + 1)
            all_frames.append((r, c, clean))

    pad = max(2, round(max_content * PADDING_RATIO))
    out_size = max(MIN_SIZE, max_content + pad * 2)
    # 對齊到 8 的倍數（sprite 友好）
    out_size = ((out_size + 7) // 8) * 8
    print(f"  最大 content：{max_content}px  輸出尺寸：{out_size}×{out_size}")

    for r, c, clean in all_frames:
        name = names[r][c]
        centered = crop_and_center(clean, out_size)
        out_path = os.path.join(out_dir, f"{name}.png")
        centered.save(out_path, "PNG")
        print(f"    ✅ {out_path}")


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    print(f"專案根目錄：{base_dir}\n")

    for sheet in SHEETS:
        print(f"=== {sheet['src']} ===")
        process_sheet(sheet, base_dir)
        print()

    print("全部完成。")


if __name__ == "__main__":
    main()
