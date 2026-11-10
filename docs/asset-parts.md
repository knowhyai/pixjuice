# 素材部件与在线换装

详情页自动探测 LOD0 所在目录的 `meta.json`，也可在素材 manifest 条目中指定 `parts_meta`（相对 `/free-assets/`）。无有效 metadata 时不显示区块，原模型、减面和下载照常运行。同产品、同 style_tier 的变体参加换装；隐藏变体仍可参与部件选择。

每个变体目录结构：

```
meta.json
parts/body.glb
parts/body.png
parts/lock.glb
parts/lock.png
```

```json
{
  "product_id": "chest-wood",
  "variant": { "palette": "wood", "condition": "intact" },
  "parts": [
    {
      "id": "body", "slot": "body",
      "name": { "en": "Body", "zh": "箱体", "ja": "本体", "ko": "본체", "es": "Cuerpo" },
      "glb": "parts/body.glb", "thumb": "parts/body.png", "optional": false
    },
    {
      "id": "lock", "slot": "lock",
      "name": { "en": "Lock", "zh": "锁", "ja": "錠", "ko": "자물쇠", "es": "Candado" },
      "glb": "parts/lock.glb", "thumb": "parts/lock.png", "optional": true
    }
  ]
}
```

`product_id` 必须与素材清单一致；每个 metadata 中 slot 唯一，跨款式按 slot 互换，只有当前素材中 optional 为 true 的槽位可隐藏。部件必须使用一致的单位、原点、朝向和装配姿态；不要逐件居中。所有贴图嵌入 GLB，保留 UV。路径限变体目录内 `parts/`，不允许绝对路径、远程地址或 `..`。缩略图支持 PNG/JPG/WebP。发布每个款式到素材 manifest（含 product_id、style_tier、palette、state、glb.lod0）；metadata 的 variant.condition 对应清单 state。

页面将可见部件的默认场景合并成单个 GLB，每个 slot 保持独立节点，保留各自变换、材质、纹理与 UV；不做减面或破坏性焊接。切换部件和隐藏会更新同一个 3D viewer；组合状态下不显示针对原始整模的减面控件。单件下载始终指向当前选中部件。加载失败保留错误提示，组合下载禁用，避免下载过期组合。

现有宝箱打包脚本仅在源 meta 明确含 product_id 和 parts 时复制 parts 与 meta；其他产品可以直接按上述目录及 manifest 约定交付。构建不修改任何旧宝箱 GLB。

## 隐藏验收夹具（CC0 简化几何）

- 数据：`public/parts-demo/{wood,blue}/`，独立清单 `public/parts-demo/manifest.json`，不加入公开素材清单。
- 生成源：`tests/fixtures/parts-chest/generate.mjs`，执行 `node tests/fixtures/parts-chest/generate.mjs`。
- 演示：`/free-assets/chest-wood/?parts-demo`。此参数使用独立夹具清单，不会显示旧宝箱的假部件。刷新会恢复默认组合。
- 两款式、三个槽位（body 必选，lock/lid 可隐藏）。测试使用贴图和 UV 的独立盒体，代表数据结构，不代表正式素材质量。
- 单测：`tests/parts.test.mjs`，含错误 metadata、跨产品拒绝、替换、隐藏与导出回读。
