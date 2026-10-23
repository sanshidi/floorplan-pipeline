# 户型临摹工作台

纯浏览器静态站点：上传户型图 → **标定比例 → 连续折线描墙 → 识别房间** → 选材质排家具 → 2D/3D → 按封闭面积估造价。

不自动从图片识别墙体（P1 规划中）；墙线由用户对照底图临摹（也可从内置三居室样板起步）。

## 本地运行

```bash
cd floorplan-pipeline
python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/
```

主入口：`index.html`（向导）· 设计器：`editor.html`（可单独打开）。

## 关键文件

| 文件 | 说明 |
|------|------|
| `index.html` / `app.js` / `styles.css` | 向导（上传后可直进设计器） |
| `editor.html` | 2D/3D 设计器（折线画墙 / 15°磁吸 / 拖角点 / 面积标定） |
| `wall-workbench.js` | 中心线墙几何、标定、房间识别、pack/unpack |
| `PRODUCT.md` | 产品定位与 schema 说明 |
| `vendor/` | 本地素材（若有） |

## 数据

浏览器 `localStorage`：

- `floorplan-pipeline-v1` — 向导状态
- `huxing-design-v1` — 方案（家具、材质、**geometry** 墙/房/标定）

墙体支持旧 AABB `[x0,y0,x1,y1,kind]` 与中心线 `[x0,y0,x1,y1,kind,thick]`（详见 `PRODUCT.md`）。

## 限制

- 房间识别为栅格洪水填充近似；极密斜墙/开口可能需人工调整
- 自建房间 id 为自动生成；向导勾选的样板房间材质主要在「样板起步」时生效
- 未做云端识墙 / 账号同步
