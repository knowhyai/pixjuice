# 自动换装（schema v1）

唯一结构约定见 [冻结 schema](outfit-schema.md)，源文件 `/workspace/pixjuice-briefs/outfit-schema.md`。不再支持旧 variant / 每部件 optional 格式。

详情页从 manifest.parts_meta（相对 /free-assets/）或 LOD0 同目录探测 meta.json；缺失或非法时不显示换装区，不修改旧素材。product_id 必须与清单一致。按 meta 的 slots 顺序展示；槽位 required 决定是否可隐藏。所有 presets 和默认搭配在解析时校验。无 meta 的旧宝箱继续原有预览/减面功能。

隐藏夹具：`public/parts-demo/{character,prop}/`，独立清单 `public/parts-demo/manifest.json`，不会进入公开网格。生成源 `scripts/generate-outfit-demo.mjs`，构建时自动生成 CC0 几何 GLB、带 UV/法线/贴图/材质的部件与缩略图。角色五槽、五根共享骨、Idle、两套预设；道具四槽 socket、两种锁/盖和 Open 动画。演示不是正式人形 Avatar。

使用已有详情页外壳打开：
- `/free-assets/chest-wood/?parts-demo=1&demo-kind=character`
- `/zh/free-assets/chest-wood/?parts-demo=1&demo-kind=prop`

`demo-kind` 选择独立清单中的产品，也可以通过已有路径 `/free-assets/chest-wood/?parts-demo=1` 默认进入角色。支持五语路径。`preset` / `outfit` 严格按 schema 第 9 节编码；切换时 replaceState，坏参数清除并回默认。

预览仅创建一次主 AnimationMixer；部件按骨名绑定至主骨架，保留 inverse bind/权重。手持物和道具部件挂到声明 socket 并应用 offset。切换只更改可见性，时间轴不重启。随机用部分约束剪枝和回溯，在叶节点检查全部依赖。互斥槽清空后禁用；依赖不满足的选择不可用。

整套导出在浏览器内使用 gltf-transform，读取 base 与已选部件。保留主动画、socket 层级、UV/法线/材质/贴图，蒙皮 joint 引用按名字转到主骨骼，删除副本骨架；不焊接、不减面。单件链接直接下载原 GLB。组合导出不保存当前动画瞬时姿态，而保留原动画剪辑和绑定姿态。

站点可访问说明：`/guides/outfits-unity.html`、`/guides/outfits-godot.html`，`?lang=zh` 等切换五语，换装区直接链接。

验证：`pnpm test && pnpm build`；浏览器验收源 `scripts/verify-outfits.mjs`。正式宝箱/骑士按同一 schema 交付后放置文件并接入 manifest，无需第二种结构。旧宝箱 LOD0 不改，也不给旧文件补部件。
