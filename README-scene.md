# 生命探索者 · 原始海洋

可编辑 Blender 场景、可重复生成脚本和 Three.js 自由游览预览。未调用模型生成服务，也未替换用户提供的 Hyper3D 资产。

## 打开与运行

在本目录运行 `./start-preview.ps1`，或 `npm ci` 后运行 `npm run dev`，打开终端给出的本地地址。需要 Node.js 和支持 WebGL 2 的桌面浏览器。依赖已在当前工作环境安装；运行时模型、纹理与代码均由本地提供，无 CDN、账号或 API 密钥需求。

点击「进入自由探索」锁定鼠标；也可以直接拖动画面环顾。W/A/S/D 游动，Q/E 下潜/上浮，Shift 加速，Esc 释放鼠标，R 回到主机位，1–6 切换观察机位，H 隐藏界面。侧栏可调整雾浓度、开关喷流与颗粒，并切换渲染质量。

这是场景与探索控制器，不包含生命进化、任务、角色或收集系统。碰撞采用地形高度采样及保守岩体椭圆代理，适合相机游览；接入正式游戏物理引擎时应使用附带的三角地形和凸包碰撞 GLB。

## 交付文件

| 文件 | 用途 |
| --- | --- |
| `primordial_ocean.blend` | 可编辑主工程；按地形、岩石、喷口、碎石、碰撞、喷流标记、灯光/相机和资产库分组，图像已打包 |
| `scripts/build_scene.py` | Blender Python 场景生成脚本，固定随机种子 4107 |
| `public/assets/primordial_ocean.glb` | 完整静态海底，含材质、UV、切线和嵌入贴图 |
| `public/assets/collision.glb` | 独立地形碰撞网格和岩体凸包；不渲染 |
| `public/assets/rock_source.glb` / `vent_source.glb` | 保留原始面数与贴图、规范化原点和尺寸的源资产 |
| `public/assets/scene.json` | 米制单位、场景边界、高度场、相机、碰撞代理、喷口发射锚点和布局清单 |
| `public/assets/sediment_*.png` | 程序化沉积物烘焙结果：底色、法线与粗糙度 |
| `assets/source/` | 原压缩包解压后的完整资产；不覆写用户 ZIP |
| `main.js` | 水面、透射光束、GPU 热液羽流、海洋雪、动态焦散、实例化和游览控制 |
| `review/` | 资产检查、六机位截图、独立盲审、运行测试和 Khronos glTF Validator 报告 |
| `dist/` | `npm run build` 生成的可部署静态目录；需 HTTP 服务，不能用 file:// 双击打开 |

## 资产检查与复用

参考图为 `../视觉效果/原始海洋2-多视角参考图.png`，已实际读取并检查。压缩包目录与 glTF 元数据记录在 `review/asset-audit.json`；Blender 导入面数和图像尺寸记录在 `review/blender-source-audit.json`。

| 原包 | 实际内容 | 选用 |
| --- | --- | --- |
| `../岩石5.zip` | `base_basic_pbr.glb`、`base_basic_shaded.glb` | PBR GLB |
| `../热液喷口.zip` | 3 个 FBX、2 个 GLB、diffuse / metallic / normal / pbr / roughness / shaded PNG | PBR GLB，避免 FBX 材质重建偏差 |

岩石 19,209 顶点 / 35,210 三角面；喷口 22,245 顶点 / 38,402 三角面。两套选用 GLB 均有一套原 UV、2K 底色、2K 切线法线、2K 金属度/粗糙度打包图。原始 PBR 图和 UV 保留在源资产与工程资产库。中远景从同一模型生成减面版本。岩石按旋转、非等比缩放、部分埋入、组合和实例化形成不同尺度。

根据独立盲审，场景用喷口副本清理了最高处的细颈尖柱，补建了不规则矿物烟囱及有深度的开口，发射锚点移到开口中心。保留主体原 UV/底色/法线，并为场景副本生成粗糙度更高、金属度更低的 `vent_mineral_mr.png`；原始模型与原始材质没有被覆写。局部清理和新增烟囱属于 Blender 建模，不是重新生成 Hyper3D 资产。

## 空间与材质

核心海底 240 × 240 米，301 × 301 顶点基础地形，外围低细节海床延伸至 1,000 × 1,000 米，避免游览边缘出现断崖。地形包含蜿蜒浅沟、非均匀沉积丘、边缘隆起和远处岩脊。主喷口按约 13.5 米原始尺度布置，清理后最高口部距基底约 12.2 米，位于主机位右侧；四个次级喷口向中远景递减。三种平滑碎石网格共享实例，中尺度岩脊和崩落堆桥接大石与细碎沉积物，中央沙带保留通行空间。水面标高 55 米。

一单位等于一米。Blender 使用 Z-up，glTF/Three.js 使用 Y-up，转换为 `(x, y, z) → (x, z, -y)`。模型原点移至底部中心后进行米制布局。原 Hyper3D 模型的绝对物理尺寸未知，以上尺寸为参照概念图制定的场景尺度，并非资产自带测量值。

新增沉积物的程序化噪声直接栅格化为可重复平铺的 PNG，作为离线烘焙结果连接标准 Principled BSDF；导出的静态材质不依赖 Blender 程序化节点。原有 Hyper3D 材质本身已是 glTF PBR，无需重烘焙。地形 UV 每 12 米重复一次。水体和喷流是运行时着色器效果，不写入静态 GLB，也不依赖 Blender 体积对象。

主工程中保留了基础灯光和六台相机；完整水下氛围以 Three.js 预览为准。动态效果属于实时近似：雾使用指数衰减，透射光使用透明光束，水面使用程序波纹，喷流使用 GPU 粒子羽流。它们没有流体模拟、真实多次体积散射或光线路径追踪，因此与参考图的离线写实 CGI 仍存在差距。

## 重建与验证

```powershell
./rebuild.ps1
# Blender 安装在别处时：
./rebuild.ps1 -Blender 'D:\Blender\blender.exe'
```

脚本从 `assets/source` 重新导入资产，从空场景重建并覆盖生成文件。请在修改工程前另存副本。没有外部 Python 包要求，使用 Blender 自带 `bpy`、`mathutils` 和 NumPy。

```powershell
node scripts/validate.mjs
node scripts/capture.mjs  # 需先运行本地预览服务器；使用本机 Edge 的无头模式
npm run build
```

浏览器验证会记录 WebGL/JavaScript 错误、六机位帧率样本、绘制调用数、地面/边界/喷口碰撞、键盘移动、喷流开关及质量切换。帧率只是当前机器、1600 × 1000、Edge 无头模式下的样本，不能作为其他设备的性能保证。贴图与静态场景采用本地 GLB；重复网格加载后合并为 `InstancedMesh`，减少绘制调用。

实现参考：[Three.js 官方文档](https://threejs.org/docs/)。导出参数通过已安装 Blender 5.2 的实际执行和 Khronos glTF Validator 验证。
