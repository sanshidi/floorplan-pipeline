# 外部识房 JSON 契约（normalize）

`EXTERNAL_FORMAT=auto|native|xmarva|rasterscan`（默认 `auto`）。

## 我方原生 `native`

```json
{
  "units": "px" | "mm",
  "walls": [[x0,y0,x1,y1, "e"|"n"|…, thick?], …],
  "wallsPx": [[x0,y0,x1,y1], …],
  "openings": { "doors": [Door], "wins": [[x0,y0,x1,y1], …] },
  "rooms": [{ "id", "name?", "poly":[[x,y],…], "areaM2?" }],
  "imagePx": { "width", "height" },
  "meta": {}
}
```

坐标：`units:"mm"` 直接当毫米；`units:"px"`（或启发式）× `scaleMmPerPx`。

## xmarva / floorplan-detection

```json
{
  "detectionResults": {
    "walls": [{ "position": { "start": {"x","y"}, "end": {"x","y"} }, "thickness?", "type?" }],
    "doors": [{ "position": { "start","end" }, "is_entrance?" }],
    "windows": [{ "position": { "start","end" } }],
    "rooms": [{ "id?", "label"|"name", "polygon"|"poly" }]
  }
}
```

## RasterScan 宽松形

```json
{
  "source": "rasterscan",
  "plan_recognition": {
    "walls": [{ "start"|"from", "end"|"to", "thickness?" }],
    "rooms": [{ "name", "points"|"poly", "area?" }],
    "doors": [{ "start","end","name?" }],
    "windows": [{ "p1","p2" }]
  }
}
```

也可顶层直接 `walls`/`rooms`/`doors`（无 `plan_recognition` 时靠字段形探测）。

## 鉴权与失败

- `EXTERNAL_API_KEY` → `X-API-Key` + `Authorization: Bearer`
- 超时 / HTTP 错 / 无墙 → 引擎降级 **cv → stub**，`meta.fallback` 记录原因

Fixture：`server/src/engine/fixtures/`；`npm test`；`npm run mock:external`。
