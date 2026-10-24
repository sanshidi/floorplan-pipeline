# 产品说明 · 户型临摹工作台

## 定位

面向「已有户型图、想在浏览器里**标定尺寸、描摹墙体、排家具、选材质、看 3D、估地面造价**」的用户。  
主路径是**自包含静态网页**：无需构建即可手画临摹。  
**可选**本地 Node 识墙草稿 API（P1）：默认 OpenCV Hough + 可选本地 semantic-post；亦可接自建 RasterScan/FastAPI（`EXTERNAL_*`）。另有磁盘云存档与公开分享只读链（P1.5）。**必须人工核对**——不是酷家乐/商业级语义识房。

## 用户流程

1. **上传户型图** — PNG/JPG/WEBP，存为 data URL（仅本机）；可直接「进入设计器临摹」（P0.2 缩短首访）
2. **可选：样板 / 材质** — 样板起步与地面墙面仍可从导航进入，不挡主路径
3. **设计器（临摹工作台 · P0 手感 + 可选 P1 草稿）**
   - 参照底图（可调透明度）
   - **标定比例**：两点 + 真实毫米；或 **建筑面积㎡反推比例**
   - **可选「生成墙草稿」**（有底图时）：调用本地 `POST /v1/vectorize`；成功写入 `source: 'ai-draft'`；修墙条：**正交对齐 / 重画此段 / 删构件 / 接受草稿**；失败/超时 → 继续 P0 手画
   - **连续折线画墙**：点一下继续，回车/双击/右键结束；默认 **15° 磁吸**（Shift 或关开关 = 自由斜墙）
   - **拖角点**：选中墙后拖两端；共享角点同步移动
   - **删墙**：几何命中（非仅 DOM）
   - **识别房间**：墙网栅格洪水填充 → 多边形面积（斜墙按厚度多边形涂栅格）
   - 家具布置、测量、拆非承重墙、3D 漫游、导出 PNG/JSON
   - **「下载本地包」**：ZIP（plan.json / plan.png / underlay / README），不依赖云
   - **可选「保存到云端 / 复制分享链接」**：失败回退同一套本地包
4. **结果导出 / 分享** — 作业 JSON；或打开 `share.html?id=` 只读预览并可「复制到本地编辑」

## 墙几何 schema（兼容扩展）

| 格式 | 表示 | 说明 |
|------|------|------|
| 旧 AABB | `[x0,y0,x1,y1,kind]` | 正交体矩形；样板与旧档仍用此格式 |
| 中心线 v1 | `[x0,y0,x1,y1,kind,thick]` | 第 6 元为数字厚度 → 中心线折线段；**新画的墙一律写此格式**，支持斜墙 |

- 统一消费：`wallCenterline` / `wallPolygon` / `wallAABB`（`wall-workbench.js`）
- `geometry.wallSchema: 'centerline-v1'` 为文档标记；旧档无此字段仍可读
- `geometry.source`：`template` | `custom` | `ai-draft`（识墙草稿；用户修墙后变 `custom`）
- 3D：中心线墙按走向旋转盒子挤出，**不会 silently 掰回正交**
- kind: `b` 承重 / `e` 外墙 / `n` 非承重 / `low` 矮墙

## 墙几何与造价

| 环节 | 方式 |
|------|------|
| 识墙建模 | **主路径：手动临摹**。可选 `cv-hough-v1`[+`semantic-post-v1`]；或 `ENGINE=external` 归一化 native/xmarva/rasterscan；失败降级 stub；`warning: 草稿必人工核对`；**不假装**商业级语义识房 |
| 云存档 | 磁盘 `server/data/projects/`；短随机 id；分享 GET 公开；写操作与 `API_KEY` 一致 |
| 比例 | 两点标定或建筑面积㎡反推；`calib` 写入方案 |
| 房间面积 | 识别后的封闭多边形；未识别时仍用当前 `ROOMS` |
| 造价 | `Σ(房间面积 × 地面单价) × 1.05` 损耗系数 |
| 材质套用 | 向导选择后，打开设计器时写入已选房间 id |
| 3D | 以当前 `WALLS` / `ROOMS` 重建；斜墙中心线同样进入 3D |

## localStorage 约定

- `floorplan-pipeline-v1` — 向导作业（图、选中房间、材质、`geomSource` / `scaleCalib` 摘要）
- `huxing-design-v1` — 设计方案；`geometry`：
  - `{ source, walls, rooms, calib?, openings?, refPlacement?, wallSchema? }`
  - 缺省时回退内置三居室样板墙
- `FP_API` / `FP_API_KEY` — 可选；覆盖默认识墙/云存档 API `http://127.0.0.1:8787`（也可用 `?api=` / `window.FP_API`）
- 方案可含 `cloudId` / `shareUrl`（云存档成功后写入）

## 材质来源（真实列表）

**地面（含单价）**：floorplan-3d + OpenPlan3D 对齐扩展（木、砖、大理石、地毯、混凝土等）。  
**墙面**：墙漆色 + 砖/石/木饰面等（方案记录；2D 墙线颜色仍按结构 kind）。

## 技术

- 静态 HTML/CSS/JS；`wall-workbench.js` 提供标定 / 折线画墙 / 角点 / 房间识别
- `ai-draft-client.js` / `cloud-client.js` — 识墙与云存档客户端
- `share.html` — 分享只读页
- 设计器源自 floorplan-3d 单文件；Three.js 经 jsDelivr
- 静态服务：`python3 -m http.server 8765`（或任意静态服务器）
- **可选 API**：`server/` — Express + 内存 job + 磁盘 projects；默认 CV+semantic-post；`EXTERNAL_*` 适配层；详见 `server/README.md`

## 明确不做（本版）

付费第三方识墙默认不用（可自建 RasterScan/FastAPI）、LiDAR、商家 BOM、照片级渲染、账号体系/多人权限。  
云存档仅为单机磁盘 MVP（非 SaaS）。**不做**：把 stub/CV/heuristic 宣传成「自动建模完成」。

## 路线图摘录

- **P0**（已落地）：手画折线 / 磁吸 / 角点 / 面积标定 / 上传→设计
- **P1.1–P1.4**：Node `/v1/vectorize`（CV 默认）+「生成墙草稿」+ 修墙 + 失败降级
- **P1.5（本版）**：外部 normalize（native/xmarva/rasterscan）+ semantic-post；磁盘 projects + 分享只读链
- 后续：账号、权限、真 SaaS 存档、更强语义模型
