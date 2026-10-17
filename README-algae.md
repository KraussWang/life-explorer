# 早期绿色丝状藻类生态

在现有海洋上增加独立生态层，保留海底、岩石、喷口、水面、光束与深蓝色雾。替换旧的 90 张平面植物；不改变资源、移动、碰撞、进化条件或存档结构。

## 查看

运行 `npm run dev`，打开 <http://127.0.0.1:5173/algae-preview.html>。滑块控制 `algaeGrowth`，按钮直接预览四个阶段，机位菜单包含原有六机位、藻丝近景、反向机位。拖动画面环顾，滚轮移动。此页面独立于游戏，不读写游戏存档。

正式游戏自动映射：原始单细胞 / 鞭毛细胞为 0，多细胞集合体为 0.3，蠕虫为 0.6，三个后续分支为 1。参数随时间阻尼过渡，回到较早形态时也平滑退回；0 时不渲染藻丛且岩石藻膜权重为零。

## 资产

- `scripts/build_algae.py`：固定种子 73190 的 Blender 生成脚本。
- `assets/source/algae/early-algae.blend`：独立可编辑源文件，三种近景藻丛与三种远景版本分行摆放，另有复用叶片和藻膜材质样球。
- `public/models/algae/filament-{0,1,2}.glb`：每簇 30 / 38 / 46 根渐细弯曲丝，2,460 / 3,116 / 3,772 三角面。
- `public/models/algae/filament-{0,1,2}-lod.glb`：每簇 10 根丝、310 三角面。
- `public/models/algae/leaf-reused.glb`：来自用户 `视觉效果/海草/水草.glb` 的优化副本，1,099 三角面，后期少量出现。用户源文件未改动。
- 七个 GLB 共约 309 KiB；`asset-manifest.json` 记录实际大小和面数。

重建：

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python scripts/build_algae.py
```

不需要重建或覆盖原始海洋 `.blend`。藻膜的 Blender 节点用于源材质预览；Three.js 中用等效的世界空间多尺度噪声直接混合原岩面材质，保留原贴图细节，不叠加悬浮贴片，也不增加藻膜绘制调用。

## 模块与性能

`src/algae.js` 负责采样、材质、生长、LOD 和释放。`src/world.js` 只接入材质和生态更新，`main.js` 只将物种映射到生长参数。

```js
// 每帧更新环境时传入 0–1，内部自动完成时间过渡：
world.environment(isCold, algaeGrowth, dt);
// 独立使用 createAlgae() 的返回值：
algae.algaeGrowth = 0.6;
algae.update(dt, camera);
```

布局按实际导入岩石的三角面向下射线采样；接受向上表面，使用表面法线固定根部。岩缘和相邻海床隆起使用现有高度场。固定种子产生 3,780 处落点，其中 1,392 处位于岩面；根部水平间距至少 0.58 m，中央蜿蜒空区与喷口口部附近留空。地形变更时会自动重新采样。

藻丝按三种形态及 LOD 批量渲染，加上后期复用叶片，最多新增 7 个实例绘制调用。GPU 顶点形变使用每簇独立相位，位移随局部高度平方增加，根部保持固定；生长也在 GPU 中计算。每 0.35 秒或镜头移动时更新近远景实例列表，过渡生长时提高到每 0.1 秒更新列表。36–44 m 区间用互补抖动混合近远几何，远景不绘制叶片，精细 / 流畅分别限制到 105 / 80 m。

## 验证与限制

```powershell
npm test
npm run build
npm run test:algae  # 需要 5173 开发服务器与本机 Microsoft Edge
npm run test:e2e   # 需要 4173 生产预览服务器
```

`review/algae/report.json` 保存 glTF 校验、布局间距、四阶段、双向过渡、8 个机位、浏览器错误与帧耗时样本。`review/algae/*.png` 为真实 WebGL 截图。`review/algae/blind-review.md` 为独立 agent 的视觉盲审。

性能是本机 Edge 无头模式、1440×900 下的采样，不代表其他设备。原场景本身三角面较多。藻丝属于低面数实时近似，细丝在低分辨率远景可能有细微闪烁；本模块不改变原有海洋光照或重做参考图中的离线体积效果。
