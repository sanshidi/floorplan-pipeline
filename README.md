# 户型临摹工作台

纯浏览器静态站点：上传户型图 → **标定比例 → 连续折线描墙 → 识别房间** → 选材质排家具 → 2D/3D → 按封闭面积估造价。

墙线默认由用户对照底图手画（也可从内置三居室样板起步）。  
**可选**：本地 Node 识墙草稿 API（默认 OpenCV 线检测，必人工核对）；关掉 API 时仍可完整手画，不白屏。

## 本地运行（纯静态，必选路径）

```bash
cd floorplan-pipeline
python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/
```

主入口：`index.html`（向导）· 设计器：`editor.html`（可单独打开）。

## 可选：识墙草稿 API（P1）

```bash
cd server
npm install
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
npm start
# http://127.0.0.1:8787   ENGINE 默认 cv
```

自测：

```bash
curl -s -F "file=@test-floorplan.png" http://127.0.0.1:8787/v1/vectorize
# → {"jobId":"job_…"}  再 GET /v1/jobs/:id 直到 succeeded（meta.engine=cv-hough-v1）
```

设计器 **「生成墙草稿」**（有底图）：写入 `source:'ai-draft'`，顶部修墙条提供 **正交对齐 / 重画此段 / 删构件 / 接受草稿**。  
API：`localStorage.FP_API` / `?api=` / `window.FP_API`，默认 `127.0.0.1:8787`。

默认引擎 **`cv-hough-v1`**（OpenCV 线检测草稿，**非**商业级语义识房）；失败自动降级 **`stub-heuristic-v1`**。`ENGINE=stub|cv|external`。详见 `server/README.md`。

## 关键文件

| 文件 | 说明 |
|------|------|
| `index.html` / `app.js` / `styles.css` | 向导（上传后可直进设计器） |
| `editor.html` | 2D/3D 设计器（折线画墙 / 15°磁吸 / 拖角点 / 面积标定 / 生成墙草稿） |
| `wall-workbench.js` | 中心线墙几何、标定、房间识别、pack/unpack |
| `ai-draft-client.js` | 可选识墙客户端（vectorize + 轮询） |
| `server/` | Node Express API + stub 引擎 |
| `PRODUCT.md` | 产品定位与 schema 说明 |
| `vendor/` | 本地素材（若有） |

## 数据

浏览器 `localStorage`：

- `floorplan-pipeline-v1` — 向导状态
- `huxing-design-v1` — 方案（家具、材质、**geometry** 墙/房/标定；`source`: template \| custom \| ai-draft）

墙体支持旧 AABB `[x0,y0,x1,y1,kind]` 与中心线 `[x0,y0,x1,y1,kind,thick]`（详见 `PRODUCT.md`）。

## 限制

- 房间识别为栅格洪水填充近似；极密斜墙/开口可能需人工调整
- 自建房间 id 为自动生成；向导勾选的样板房间材质主要在「样板起步」时生效
- 识墙草稿为 OpenCV 线检测（或降级 stub），**不能**当商业级自动建模成品；须人工修墙
- 未做账号同步 / 云存档
