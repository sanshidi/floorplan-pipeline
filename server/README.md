# 识墙草稿 API（P1）

异步把户型图变成**可编辑墙草稿**（中心线 mm）。  
默认引擎 **`cv-hough-v1`**（OpenCV Hough 线检测）：**不是**酷家乐/商业级语义识房，结果必须人工核对。

## 依赖

```bash
cd server
npm install

# Python 引擎（推荐 venv）
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
# 需要：opencv-python-headless、numpy、Pillow
```

也可设置 `PYTHON` 指向已安装上述包的解释器。

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
| `API_KEY` | （空） | 若设置，请求需 `X-API-Key` 或 `Authorization: Bearer …` |
| `CORS_ORIGIN` | `*` | CORS |
| `PYTHON` | `.venv/bin/python` 或 `python3` | 运行 `cv_lines.py` |
| `CV_TIMEOUT_MS` | `45000` | CV 子进程超时 |
| `EXTERNAL_VECTORIZE_URL` | （空） | 若设置且 `ENGINE=external`，POST 图到外部并映射 JSON |
| `EXTERNAL_API_KEY` | （空） | 外部接口可选鉴权头 |

**降级：** `ENGINE=cv` 时若 Python/OpenCV 失败，自动改用 `stub-heuristic-v1`，并在 `meta.fallback` 写明原因；`meta.warning` 仍为「草稿必人工核对」。

## API

### `POST /v1/vectorize` → `202 { jobId }`

`multipart/form-data`：`file`、可选 `scaleMmPerPx` / `areaM2`。

### `GET /v1/jobs/:id`

`status`: queued|running|succeeded|failed；成功时 `result.walls` 为 `[x0,y0,x1,y1,kind,thick]`（mm）。  
`result.meta.engine` 例：`cv-hough-v1` 或降级后的 `stub-heuristic-v1`。

### `GET /health`

探活；含 `preferred` / `external`。

## 引擎说明

| 引擎 | 行为 |
|------|------|
| `cv-hough-v1` | 二值化 + 形态学 + HoughLinesP + 共线合并 → 像素中心线，再 × `scaleMmPerPx` |
| `stub-heuristic-v1` | 按图幅比例造外框+隔墙（非识图） |
| `external-v1` | 转发 `EXTERNAL_VECTORIZE_URL`（无 URL 则再试 cv→stub） |

换自研模型：保持 `runEngine({ buffer, … }) → { walls, openings, rooms, meta }`，在 `src/engine/index.js` 切换即可。

## 自测

```bash
curl -s -F "file=@../test-floorplan.png" http://127.0.0.1:8787/v1/vectorize
# poll GET /v1/jobs/:id → succeeded；墙段应随图像内容变化（与 ENGINE=stub 不同）
```

## 与静态站联调

```bash
cd .. && python3 -m http.server 8765
```

设计器默认 API：`http://127.0.0.1:8787`（`localStorage.FP_API` / `?api=` / `window.FP_API`）。
