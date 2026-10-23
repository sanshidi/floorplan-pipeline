# 识墙草稿 API（P1 MVP）

异步把户型图变成**可编辑墙草稿**（中心线 mm）。当前引擎是 **可替换 stub/启发式**，不是酷家乐级模型；结果必须人工核对。

## 启动

```bash
cd server
npm install
npm start
# 默认 http://127.0.0.1:8787
```

环境变量：

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `8787` | 监听端口 |
| `HOST` | `127.0.0.1` | 绑定地址 |
| `API_KEY` | （空） | 若设置，请求需带 `X-API-Key` 或 `Authorization: Bearer …` |
| `CORS_ORIGIN` | `*` | CORS；本地静态站可保持 `*` |

## API

### `POST /v1/vectorize` → `202 { jobId }`

`multipart/form-data`：

- `file` — 户型图（png/jpg/webp）
- `scaleMmPerPx` — 可选，像素→毫米
- `areaM2` — 可选，建筑面积约束

### `GET /v1/jobs/:id`

```json
{
  "status": "queued|running|succeeded|failed",
  "progress": 0,
  "result": {
    "walls": [[x0,y0,x1,y1,kind,thick], …],
    "openings": { "doors": [], "wins": [] },
    "rooms": [],
    "meta": { "engine": "stub-heuristic-v1", "warning": "草稿必人工核对" }
  },
  "error": null
}
```

### `GET /health`

探活。

## 换引擎

改 `src/engine/`：保持 `runEngine({ buffer, mime, scaleMmPerPx, areaM2 }) → { walls, openings, rooms, meta }` 即可；路由与 job 形状不变。

## 与静态站联调

另开终端：

```bash
cd .. && python3 -m http.server 8765
```

设计器默认 API：`http://127.0.0.1:8787`（可用 `localStorage.FP_API` 或 `?api=` / `window.FP_API` 覆盖）。
