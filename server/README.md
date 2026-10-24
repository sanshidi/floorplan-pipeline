# 识墙草稿 API（P1 + P1.5）

异步把户型图变成**可编辑墙草稿**（中心线 mm），并提供**磁盘云存档 + 公开分享 GET**。  
默认引擎 **`cv-hough-v1`**（OpenCV Hough）+ 可选 **`semantic-post-v1`**（本机房间环/门洞启发式）。  
**不是**酷家乐/商业级语义识房；结果必须人工核对。无外部 key / 无 Docker 大镜像时，默认仍是 CV（+semantic-post）。

## 依赖

```bash
cd server
npm install

# Python 引擎（推荐 venv；仅 ENGINE=cv 需要）
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

也可设置 `PYTHON` 指向已安装 opencv-python-headless / numpy / Pillow 的解释器。

## 启动

```bash
cd server
npm start
# 默认 http://127.0.0.1:8787
```

### 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `8787` | 监听端口 |
| `HOST` | `127.0.0.1` | 绑定地址 |
| `ENGINE` | `cv` | `cv` \| `stub` \| `external` |
| `SEMANTIC_POST` | `1`（开） | 在 CV/stub（及外部缺房间/门时）上跑本地语义后处理；`0`/`false`/`off` 关闭 |
| `API_KEY` | （空） | 若设置，**写操作**需 `X-API-Key` 或 `Authorization: Bearer …`；分享 GET 仍公开 |
| `CORS_ORIGIN` | `*` | CORS |
| `PYTHON` | `.venv/bin/python` 或 `python3` | 运行 `cv_lines.py` |
| `CV_TIMEOUT_MS` | `45000` | CV 子进程超时 |
| `EXTERNAL_VECTORIZE_URL` | （空） | 外部识房服务 URL（`ENGINE=external`） |
| `EXTERNAL_FORMAT` | `auto` | `auto` \| `native` \| `xmarva` \| `rasterscan` |
| `EXTERNAL_API_KEY` | （空） | 同时发 `X-API-Key` + `Authorization: Bearer` |
| `EXTERNAL_TIMEOUT_MS` | `25000` | 外部 HTTP 超时 |
| `PUBLIC_BASE` | `http://127.0.0.1:8765` | 分享链接前缀（静态站） |
| `PROJECTS_DIR` | `server/data/projects` | 云存档目录（已 gitignore） |

**降级链：** `external` → `cv`(+semantic-post) → `stub`(+semantic-post)。`meta.fallback` / `meta.engine` 写清链路。

## 外部语义适配（诚实、可落地）

外部服务可返回任一种 JSON，本仓 `normalize.js` 统一成原生草稿：

```json
{
  "units": "px" | "mm",
  "walls": [[x0,y0,x1,y1, kind?, thick?], ...],
  "openings": { "doors": [...], "wins": [...] },
  "rooms": [{ "id", "name?", "poly", "areaM2?" }],
  "meta": {}
}
```

| 格式 | 探测特征 | 说明 |
|------|----------|------|
| `native` | 顶层 `walls` / `wallsPx` | 我方契约；`units` 或启发式判 px/mm |
| `xmarva` | `detectionResults.walls[].position.start/end` | xmarva/floorplan-detection 形 |
| `rasterscan` | `plan_recognition` / `source:rasterscan` / `walls[].start|from` | RasterScan `/plan_recognition` 宽松兼容 |
| `auto` | （默认） | `detectFormat` 后 normalize |

### 指到自建服务（无付费 RapidAPI）

**A. 本仓 mock（单测 / 联调，无 Docker）：**

```bash
cd server
npm run mock:external          # :8799，默认吐 rasterscan fixture
# 另开终端：
EXTERNAL_VECTORIZE_URL=http://127.0.0.1:8799/plan_recognition \
EXTERNAL_FORMAT=auto ENGINE=external npm start
```

**B. 自建 RasterScan Docker**（需自行 pull 镜像，本仓不默认拉）：

```bash
# 示例：假设容器暴露 8080 且路径为 /plan_recognition
EXTERNAL_VECTORIZE_URL=http://127.0.0.1:8080/plan_recognition \
EXTERNAL_FORMAT=rasterscan ENGINE=external npm start
```

**C. 自建 FastAPI** 返回 native 或上述任一种：

```bash
EXTERNAL_VECTORIZE_URL=http://127.0.0.1:9000/vectorize \
EXTERNAL_FORMAT=native ENGINE=external \
EXTERNAL_API_KEY=your-token npm start
```

单测（不启服务）：

```bash
npm test   # fixtures: native / xmarva / rasterscan + semantic-post
```

## semantic-post（无外部服务时）

`ENGINE=cv`（默认）且 `SEMANTIC_POST` 未关时：

1. 对识出的墙跑 `wall-workbench.findRoomsFromWalls`
2. 按面积排序赋临时中文房间名
3. 墙缺口 ~0.7–1.2 m 启发式猜门洞

`meta.engine` 例：`cv-hough-v1+semantic-post-v1`。

关闭：`SEMANTIC_POST=0 npm start`。

## 云存档 + 分享（P1.5）

磁盘：`server/data/projects/{id}.json`（gitignore）。

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| `POST` | `/v1/projects` | 与 `API_KEY` 同（若设置） | body: `{ title?, geometry, thumbnailDataUrl?, meta?, id? }` → `{ id, shareUrl }` |
| `PUT`/`PATCH` | `/v1/projects/:id` | 同上 | 覆盖 |
| `GET` | `/v1/projects/:id` | **公开** | 完整方案（只读分享） |
| `GET` | `/v1/projects/:id/meta` | **公开** | 轻量元数据 |

`shareUrl` 形如 `{PUBLIC_BASE}/editor.html#/share/{id}`（会跳到 `share.html?id=` 只读页）。  
设计器「文件」菜单：**保存到云端** / **复制分享链接**；失败时回退本地导出 JSON。

```bash
curl -s -X POST http://127.0.0.1:8787/v1/projects \
  -H 'Content-Type: application/json' \
  -d '{"title":"demo","geometry":{"walls":[[0,0,4000,0,"e",240]],"rooms":[]}}'
# → {"id":"…","shareUrl":"http://127.0.0.1:8765/editor.html#/share/…"}
curl -s http://127.0.0.1:8787/v1/projects/<id>
```

## API（识墙）

### `POST /v1/vectorize` → `202 { jobId }`

`multipart/form-data`：`file`、可选 `scaleMmPerPx` / `areaM2`。

### `GET /v1/jobs/:id`

成功时 `result.walls` 为 `[x0,y0,x1,y1,kind,thick]`（mm）。

### `GET /health`

含 `preferred` / `external` / `semanticPost` / `publicBase`。

## 引擎一览

| 引擎 | 行为 |
|------|------|
| `cv-hough-v1` | OpenCV 线检测 → mm 中心线 |
| `+semantic-post-v1` | 本机房间环 + 临时名 + 门洞启发式 |
| `stub-heuristic-v1` | 按图幅比例造外框（非识图） |
| `external-v1` | 转发外部 URL + normalize（native/xmarva/rasterscan） |

## 与静态站联调

```bash
cd .. && python3 -m http.server 8765
# 分享只读：http://127.0.0.1:8765/share.html?id=<id>
```

设计器 API：`localStorage.FP_API` / `?api=` / `window.FP_API`（默认 `127.0.0.1:8787`）。
