# 生命探索者 · P0 MVP

新增早期绿色丝状藻类生态：见 [实现与预览说明](README-algae.md)。本地 [生态预览页](http://127.0.0.1:5173/algae-preview.html) 可切换 0 / 0.3 / 0.6 / 1 生长阶段与多机位；游戏按物种阶段自动平滑过渡。

基于 `../生命探索者PRD-v1.md` 的桌面浏览器演化探索游戏。保留原有 Three.js 原始海洋、热液喷流、海床与碰撞，增加完整 P0 游戏闭环。无需 API key、云服务或外部 CDN。

## 启动

双击或在 PowerShell 执行 `./start-preview.ps1`，自动打开开发预览。

```powershell
cd C:\Files\projects\Hackthon\primordial-ocean
npm ci
npm run dev
```

生产预览：

```powershell
npm run build
npm run preview -- --port 4173
```

浏览器打开 `http://127.0.0.1:4173/`。推荐桌面 Edge / Chrome 与键鼠。首次加载需要本地模型；请通过 HTTP 服务打开，不能直接双击 HTML。

## 操作与演示路线

| 操作 | 按键 |
| --- | --- |
| 前后左右游动 | WASD / 方向键 |
| 上浮 / 下潜 | Space / Q |
| 加速 | 左 Shift |
| 环顾 / 缩放 | 鼠标拖动 / 滚轮 |
| 对准下个探索目标 | R |
| 主动打开演化选择 | E |
| 打开生命图鉴 | Tab |
| 暂停 / 关闭面板 | Esc |

1. **M1**：开始旅程，寻找带微弱暖色轮廓光的灰白有机絮团。靠近吸收 3 团后按 E，确认演化为鞭毛型单细胞。
2. **M2**：吸收 2 团有机絮团，进入蓝色冷流区触发极寒。游向紫色同类群取得聚集条件，再按 E 选择多细胞集合体。寒潮结束，S02 藻类生态层出现。
3. 收集 1 份绿色复杂食物与 2 枚橙色特化资源，按 E 演化为蠕虫状祖先。此时自动创建分叉存档。
4. **M3**：按 E，在双壳贝 / 海蛞蝓 / 原始鱼型中选择路线。终点可打开 3D 图鉴、继续游动，或返回蠕虫分叉点。图鉴累计保留全部路线的发现。

所有演化由玩家确认；过场约 4.5 秒并锁定移动。极寒由空间探索触发，体温降低会减慢游动，同类群可提供庇护；不会按计时强迫演化或造成永久卡关。

## 实现范围

- S01 原始海洋与 S02 早期生命海洋共用海床，使用光照、雾色、寒潮边缘效果、藻类和资源类型切换环境。
- 7 个 JSON 驱动的生命节点、三种阶段资源、冷流与同类区域、目标方向 / 距离 / 高度提示。
- 第三人称跟随、旋转、缩放、海床高度约束及原有岩石/喷口碰撞代理。
- 单细胞漂浮呼吸、鞭毛摆动、程序化蠕虫分节运动、鱼体摆动。未绑定骨骼的 GLB 使用运行时顶点形变。
- 营养资源使用 Blender 制作的半透明有机絮团 GLB：多孔薄膜、细丝与颗粒；模型加载失败时回退到原有程序化絮团。缓慢漂移、旋转；6 m 内显示靠近吸收提示，远处保留任务距离与 R 对准。触碰后立即保存营养计数，并用 1.15 秒吸附分解动画呈现收集。
- 原始鱼型是 P0 的阶段终点，后续鱼类 / 登陆路线不在本版本内。
- 图鉴含名称、时期、特征、生境、分支关系、介绍、锁定提示、可旋转缩放的实际 3D 模型；支持上一张 / 下一张及说明区触摸横滑。
- 默认流畅画质：最高 0.8 像素比、关闭阴影、减少悬浮粒子和喷口粒子；精细画质可在暂停菜单启用。

## 模型与源文件

| 生命形态 | 运行资源 / 来源 |
| --- | --- |
| 原始单细胞 | `public/models/cell.glb`，用户的 marine_single_cell |
| 鞭毛型单细胞 | `public/models/flagellate.glb`，用户的鞭毛细胞 base.glb |
| 多细胞集合体 | `public/models/colony.glb`，用户的多细胞模型 |
| 蠕虫状祖先 | 程序化分节占位模型，图鉴中明确标注 |
| 双壳贝 | `public/models/bivalve-lod.glb`，用户的扇贝模型优化副本 |
| 海蛞蝓 | `public/models/slug.glb`，用户的海蛞蝓模型 |
| 原始鱼型 | `public/models/fish-lod.glb`，同目录下发现的“无鱼鳍鱼”优化副本 |

鱼运行模型由 200 万面降至 10 万面、约 60.3 MB 降至 7.0 MB；扇贝贴图优化后约 7.4 MB。原始用户目录没有修改，优化输入副本在 `assets/source/creatures`。可通过 Blender 执行 `scripts/optimize-creatures.py` 重建优化模型。

鞭毛型单细胞在游戏和图鉴中共用 `src/flagellate.js` 的实时材质。原 GLB 是单网格、无贴图资产；代码依据模型局部轴区分细胞主体与鞭毛，为主体加入随视角变化的半透明膜和浅蓝边缘反光，为内部加入柔和的细胞质及颗粒，并仅让鞭毛端摆动。原 GLB 文件保持不变；半透明效果依赖 Three.js 渲染，直接打开 GLB 不会显示这一层运行时材质。

原场景入口源码在 `review/baseline`，原始场景制作说明保留为 `README-scene.md`。`scripts/extract-world.mjs` 是最初提取环境代码的历史工具，后续环境维护直接修改 `src/world.js`，不要重复执行覆盖新增环境层。

有机絮团的可编辑源文件为 `assets/source/nutrient-floc/nutrient-floc.blend`，运行模型为 `public/models/nutrient-floc.glb`。在项目目录运行 `blender --background --python scripts/build_nutrient_floc.py`，可从 `../视觉效果/有机絮团.zip` 中的 OBJ 和贴图重建两者；Blender 文件已打包贴图。网页端使用半透明混合与关闭深度写入；`review/nutrients-detail.png`、`review/nutrients-side.png` 和 `review/nutrients-gameplay-high.png` 是实景检查截图。

第一阶段的絮团数量、缩放、尺寸差异、最小间距、分布边界、水层高度和吸收目标统一在 `src/organic-floc-config.js` 调整。默认生成 15 个，吸收任意 3 个即可解锁鞭毛型单细胞；出生点前方预留 3 个可发现的絮团，其余在配置范围内按最小间距采样并避开场景碰撞代理。运行 `node scripts/check-organic-floc.mjs` 可检查实际浏览器中的 HUD 进度与进化提示，`npm test` 会检查位置和计数。

## 存档

localStorage 键：`life-explorer.p0.v1`，版本 1。保存当前形态、位置、阶段资源、环境事件、累计图鉴、画质和蠕虫分叉快照。采集 / 演化 / 返回分叉时立即保存，探索中每 4 秒自动保存，暂停菜单支持手动保存。

读档校验版本、物种白名单、坐标、资源 ID 与计数一致性。损坏存档提示重新开始；本地存储不可用时仍可游玩，但界面明确提示仅当前会话。重新开始需要确认并保留已发现图鉴。存档按浏览器与访问地址隔离，5173 与 4173 端口不共享存档。

## 验证

```powershell
npm test
# 营养资源专项检查（4173 生产预览、5173 开发预览同时运行）：
node scripts/check-nutrients.mjs
# 另一个终端启动生产预览后：
npm run test:e2e
node scripts/test-edgecases.mjs
```

E2E 使用安装在本机的 Microsoft Edge（Playwright），默认访问 4173。`MVP_URL` 可覆盖完整流程测试地址。主流程只通过真实键盘、鼠标与 UI 操作推进，诊断接口 `window.__life.snapshot` 只读，未提供跳关功能。

- `review/mvp-test-report.json`：完整演化链、3 条分支、图鉴、刷新恢复、暂停、画质、地形约束、重新开始的浏览器断言。
- `review/edgecase-test-report.json`：损坏 / 未来版本存档、拒绝存储、加载失败重试、锁定图鉴。
- `review/agent-review.md`：独立审查 agent 的发现与修复复核。
- `review/model-optimization.json`、`review/fish-performance.json`：模型优化与本机鱼形态运行样本。
- `review/mvp-*.png`：1440×900、1280×720 的真实浏览器截图。

本版本定位桌面 P0；没有移动端虚拟摇杆、独立制作的第二海床、骨骼动画或后续 P1/P2 演化节点。演化文案采用种群、支系代表和世代跨度，不把现生动物描述为彼此的直接祖先。
