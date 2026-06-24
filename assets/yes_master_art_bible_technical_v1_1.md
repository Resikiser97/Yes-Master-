# Yes, Master! Art Bible v1.1 — 程序 / Sprite Sheet / 导入对接版

> 用途：给程序接入、Sprite Sheet 管理、资源命名与测试使用  
> Project: **Yes, Master!**

---

## 1. 项目基础信息

### 正式游戏名称
`Yes, Master!`

### 世界观名称
`哥布林的信仰`

### 游戏基础
- 2D 横向平面
- 1~4 人合作
- 挖矿 / 建造 / 塔防
- 游戏画面：`800 × 600`
- 单格逻辑：`10 px`

---

## 2. 技术目标

Phase 1 的目标不是完整游戏，而是：
- 正确接入第一批素材
- 能在测试场景中播放角色与核心动画
- 能检查资源在实际游戏比例下的可读性

---

## 3. 建议资源目录结构

```text
assets/
  blocks/
    tile_sand.png
    tile_dirt.png
    tile_stone.png
    tile_iron_ore.png
    tile_gold_ore.png
    tile_glazed_glass.png
    tile_diamond_ore.png
    tile_ladder.png
    tile_hollow.png

  core/
    core_orb_normal.png
    core_orb_hit.png
    core_orb_lowhp.png

  characters/
    goblin/
      goblin_idle.png
      goblin_walk.png
      goblin_mine.png

  enemies/
    civilian/
      enemy_civilian_walk.png
    runner/
      enemy_runner_walk.png

  backgrounds/
    bg_mine_wall_test.png

  ui/
```

---

## 4. 素材尺寸规范

### 方块
- 逻辑类别：地图材料 / 建造材料
- 建议原始尺寸：`16 × 16 px`
- 实际地图逻辑格：`10 px`
- 注意：缩放时务必关闭平滑，避免模糊

### 角色
- `32 × 32 px` 每帧
- 角色与敌人统一使用同类帧大小

### 核心 Orb
- 建议使用：`20 × 20 px` 每帧
- 若工具或导入流程需要，也可使用 `24 × 24 px` 后再统一处理
- 但最终游戏内视觉目标要接近 20×20 的辨识度

### 背景
- 测试背景：`800 × 600 px`
- 或可平铺 strip / segment

### UI（后续）
- `16 × 16 px` / `32 × 32 px`

---

## 5. 渲染要求

### 必须项
- 使用透明背景 PNG
- 关闭 image smoothing
- 使用 `image-rendering: pixelated`
- 尽量避免非整数缩放

### 缩放建议
优先：
- 1x
- 2x
- 4x
- 8x

若方块原始是 16px、逻辑格是 10px，则测试时要特别关注清晰度与边缘表现。

---

## 6. Sprite Sheet 规范

## 6.1 角色

### 哥布林
文件：
- `goblin_idle.png`
- `goblin_walk.png`
- `goblin_mine.png`

每个文件建议：
- 独立 sprite sheet
- 每格 `32 × 32`
- 单行排列或单动画独立文件皆可

建议帧数：
- idle：4 帧
- walk：4 帧
- mine：4 帧

### 敌人
文件：
- `enemy_civilian_walk.png` 或
- `enemy_runner_walk.png`

建议：
- 每格 `32 × 32`
- walk：4 帧

---

## 6.2 核心 Orb

文件：
- `core_orb_normal.png`
- `core_orb_hit.png`
- `core_orb_lowhp.png`

建议帧数：
- normal：4 帧
- hit：2 帧
- lowhp：4 帧

每格建议：
- `20 × 20` 或 `24 × 24`

---

## 7. 动画命名与播放约定

### 建议命名键
```text
idle
walk
mine
hit
lowhp
```

### 资源与动画映射示意
```text
goblin_idle     -> idle
goblin_walk     -> walk
goblin_mine     -> mine
core_orb_normal -> idle
core_orb_hit    -> hit
core_orb_lowhp  -> lowhp
```

---

## 8. 锚点 / 对齐建议

### 方块
- 默认左上对齐或格子对齐
- 每个方块应可稳定放入 tile map

### 角色
- 建议以脚底 / 下中心作为主要对齐锚点
- 多动作间锚点尽量一致，避免播放时抖动

### 核心 Orb
- 建议以中心点作为主要定位逻辑
- 若有阴影或 aura，视觉中心仍需保持一致

---

## 9. Phase 1 测试场景需求

程序测试场景建议支持：

### Tile 测试
- 能显示 9 种基础 tile
- 能测试堆叠 / 连续排列
- 能测试 tile_hollow 与 ladder 的环境适配

### 角色测试
- goblin idle / walk / mine 切换
- 一只敌人 walk 播放

### 核心测试
- normal / hit / lowhp 状态切换
- 测试核心在 20×20 左右尺寸下的辨识度

### 背景测试
- 显示 `bg_mine_wall_test`
- 检查前景与背景对比

---

## 10. Phase 1 验收清单

### 方块验收
- [ ] 9 种 tile 功能明确
- [ ] `tile_dirt` 无草皮、无明显 Minecraft 草方块感
- [ ] `tile_glazed_glass` 命名与视觉一致
- [ ] 所有方块缩放后依然可辨识

### 角色验收
- [ ] 哥布林动作清楚
- [ ] 哥布林与敌人轮廓区分明显
- [ ] 动画播放不跳动

### 核心验收
- [ ] 核心为小型悬浮 orb
- [ ] 20×20 左右仍可清楚辨识
- [ ] normal / hit / lowhp 差异明显

### 背景验收
- [ ] 不抢戏
- [ ] 支撑地下矿洞氛围
- [ ] 前景角色不被吞没

---

## 11. 旧版到新版的迁移说明

### 项目命名迁移
旧英文名（不要再用于标题 / 商店页 / 宣传主标）：
- Goblin's Faith

新：
- Yes, Master!

### Lore 说明
- `哥布林的信仰` 不再作为主游戏标题
- 改为世界观背景名称

### 方块命名更新
- `glass` -> `tile_glazed_glass`
- `dirt` 重新定义为纯泥土块，无草皮

### 核心定义更新
- 旧概念中的带底座核心建筑废弃
- 新版本统一采用小型 `core_orb_*`

---

## 12. 推荐下一步

1. 更新 Art Bible 引用版本到 `v1.1`
2. 重做 / 采用新的 `tile_dirt`
3. 统一后续资源命名为 `Yes, Master!` 项目标准
4. 进入 Phase 1 第一批素材正式修订与导入测试
