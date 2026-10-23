# 户型临摹工作台

纯浏览器静态站点：上传户型图 → **标定比例 → 连续折线描墙 → 识别房间** → 选材质排家具 → 2D/3D → 按封闭面积估造价。

墙线默认由用户对照底图手画（也可从内置三居室样板起步）。  
**可选**：本地 Node 识墙草稿 API，一键写入可编辑墙（**stub/启发式，必人工核对**）；关掉 API 时仍可完整手画，不白屏。

## 本地运行（纯静态，必选路径）

```bash
cd floorplan-pipeline
python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/
```

主入口：`index.html`（向导）· 设计器：`editor.html`（可单独打开）。

## 可选：识墙草稿 API（P1 MVP）

```bash
cd server
npm install
npm start
# http://127.0.0.1:8787
```

自测：

```bash
curl -s -F "file=@test-floorplan.png" http://127.0.0.1:8787/v1/vectorize
# → {"jobId":"job_…"}  再 GET /v1/jobs/:id 直到 succeeded
```

设计器工具栏 **「生成墙草稿」**（有底图时）：轮询 job → 写入 `geometry.source: 'ai-draft'` → 顶部修墙提示。  
API base：默认 `http://127.0.0.1:8787`；可用 `localStorage.FP_API`、`?api=` 或 `window.FP_API`。

当前引擎 **`stub-heuristic-v1`**：按图片宽高（+ 可选 `scaleMmPerPx` / `areaM2`）生成外墙+隔墙示例中心线，**不是**真实 CV / 酷家乐级模型。换引擎只改 `server/src/engine/` adapter。详见 `server/README.md`。

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
- 识墙草稿为 stub/启发式示例墙，尺度可叠常见户型，**不能**当自动建模成品
- 未做账号同步 / 云存档
