# 户型生成工作台

纯前端中文 SPA：上传户型图作为参照 → 选择房间与材质 → **在本页**完成 2D 布置 / 3D 漫游 / 地面造价 / 导出。

不打开外部 SaaS，不要求 Pascal MCP，不「跳出去用别的工具」。

## 快速开始

```bash
cd /workspace/floorplan-pipeline
python3 -m http.server 8765 --bind 127.0.0.1
```

打开 <http://127.0.0.1:8765/>

## 页面

| 路径 | 说明 |
|------|------|
| `/` (`index.html`) | 五步向导：上传 → 房间 → 材质 → 设计器 → 导出 |
| `/editor.html` | 内嵌设计器（基于 [floorplan-3d](https://github.com/wy51ai/floorplan-3d)，已扩材质与参照底图） |
| `/vendor/floorplan-3d/` | 上游克隆（未改源，便于对照） |

## 本机存储

- `localStorage['floorplan-pipeline-v1']` — 向导作业（图片 data URL、材质、房间勾选等）
- `localStorage['huxing-design-v1']` — 设计器方案（家具、房间材质、拆墙、测量）

## 能力边界

- **会做**：参照底图、样板墙体上布置家具、地面/墙面材质、造价估算（面积×单价×1.05）、测量、拆非承重墙、2D/3D、PNG/JSON 导出
- **不做**：从图纸自动识别墙体 / 矢量化；连接 OpenPlan3D 云端或 Pascal MCP

详见 [PRODUCT.md](./PRODUCT.md)。

## 上游致谢

- [wy51ai/floorplan-3d](https://github.com/wy51ai/floorplan-3d) — 2D/3D 编辑器内核
- [OpenPlan3D](https://app.openplan3d.com/) — 地面/墙面材质目录参考（列表已写入本产品，运行时不访问其网站）
