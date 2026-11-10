# PixJuice 自动换装数据格式（meta.json）

版本：`schema_version: 1`
状态：已冻结，供网站实现、占位演示，以及宝箱 / 骑士产线按此出数。若要改字段，升到 v2，不要静默破坏 v1。

本文只约定数据与运行时语义。站点对外不标注生成工具；素材授权为 CC0 1.0。

---

## 1. 目录约定

每件可换装产品（一个 `product_id`）一个根目录，一份 `meta.json`：

```
public/free-assets/<product-id>/
  meta.json
  LICENSE.txt
  rig/
    base.glb              # 主骨架 / 绑定姿态 / 动画；道具则含 socket 空节点
  parts/
    <part-id>.glb
    <part-id>.png         # 缩略图，正方形，建议 256–512
```

- 路径一律相对 `meta.json` 所在目录，只用正斜杠，禁止 `..`。
- 部件文件名与 `parts[].id` 一致（小写、数字、连字符）。
- 旧素材若没有 `meta.json` 或 `rig/`，详情页不显示换装区块，也不伪造部件。

---

## 2. 两种绑定方式

| kind | 用途 | 对齐方式 |
| --- | --- | --- |
| `character` | 角色（骑士、法师等） | 该产品**所有蒙皮部件共用同一套骨骼**。部件 GLB 里的 `SkinnedMesh` 在加载时按**骨骼名**重新绑定到 `rig/base.glb` 的主骨架。换装不得重建或重启主 `AnimationMixer`，当前动画时间轴保持连续。 |
| `prop` | 道具（宝箱、木桶等） | 部件按 `socket` 空节点吸附。`base.glb`（或底座部件）带有名称稳定的空节点；部件根（或指定 origin 节点）父到该 socket，再乘可选 offset。盖子开合等动画若在 socket 所在骨架上，换装后仍应播放。 |

角色手持物（`main_hand` / `off_hand`）也走 socket：socket 打在主骨架的手上（如 `mixamorig:RightHand`）。

骨骼命名默认与 Mixamo / Unity Humanoid 兼容（`mixamorig:Hips` 等）。自定义骨架须在 `rig.profile` 写 `custom`，并保证该产品内所有部件骨骼名与 `base.glb` 完全一致。

---

## 3. 根对象

```json
{
  "schema_version": 1,
  "product_id": "knight",
  "kind": "character",
  "name": {
    "en": "Knight",
    "zh": "骑士",
    "ja": "騎士",
    "ko": "기사",
    "es": "Caballero"
  },
  "rig": { },
  "slots": [ ],
  "parts": [ ],
  "presets": [ ],
  "default_preset": "full-plate"
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `schema_version` | 是 | 目前为 `1`。 |
| `product_id` | 是 | 与目录名、清单里的产品 id 一致。跨产品禁止混装。 |
| `kind` | 是 | `character` 或 `prop`。 |
| `name` | 是 | 五语：`en` 必填，`zh` / `ja` / `ko` / `es` 建议都给。 |
| `rig` | 是 | 见第 4 节。 |
| `slots` | 是 | 非空数组。顺序即界面槽位顺序。 |
| `parts` | 是 | 非空数组。每个部件只属于一个槽位。 |
| `presets` | 否 | 预设整套搭配。建议至少 1 套。 |
| `default_preset` | 否 | 打开页面且 URL 无搭配参数时使用的预设 `id`。若缺省，则每个 `required` 槽位用该槽的 `default_part`，其余留空。 |

---

## 4. `rig`

```json
"rig": {
  "glb": "rig/base.glb",
  "armature": "Armature",
  "skeleton_root": "mixamorig:Hips",
  "profile": "mixamo",
  "animations": ["Idle", "Walk"],
  "sockets": [
    { "id": "main_hand", "node": "mixamorig:RightHand" },
    { "id": "off_hand", "node": "mixamorig:LeftHand" }
  ]
}
```

道具示例：

```json
"rig": {
  "glb": "rig/base.glb",
  "armature": "Armature",
  "profile": "custom",
  "animations": ["Open", "Close"],
  "sockets": [
    { "id": "lock", "node": "socket_lock" },
    { "id": "lid", "node": "socket_lid" },
    { "id": "strap", "node": "socket_strap" }
  ]
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `glb` | 是 | 主文件。角色：骨架 + 绑定姿态 + 动画（可含不换的身体基底）。道具：带 socket 的底座和动画。 |
| `armature` | 角色必填 | 主骨架节点名。 |
| `skeleton_root` | 建议 | 根骨名，默认 `mixamorig:Hips`。 |
| `profile` | 是 | `mixamo`、`unity-humanoid` 或 `custom`。 |
| `animations` | 否 | `base.glb` 中可供预览切换的动画 clip 名。 |
| `sockets` | 视槽位 | 每个 socket 的 `id` 与槽位 `socket` 字段对应；`node` 是 `base.glb`（或主骨架）里已有空节点 / 骨骼名。 |

Socket 节点在导出的绑定姿态下必须已摆好位置、旋转、缩放。运行时不再猜偏移，除非部件自己带 `attach.offset`。

---

## 5. `slots`

角色建议槽位（按此 id，可不全部使用，不要自造近义词）：

`head`、`chest`、`shoulders`、`arms`、`legs`、`cape`、`main_hand`、`off_hand`

道具建议槽位：

`body`、`lock`、`lid`、`strap`（以及该道具真正需要的其它短 id，如 `hinge`）

```json
{
  "id": "head",
  "name": {
    "en": "Head",
    "zh": "头部",
    "ja": "頭部",
    "ko": "머리",
    "es": "Cabeza"
  },
  "required": false,
  "bind": "skinned",
  "default_part": "helm-steel"
}
```

手持或道具吸附槽：

```json
{
  "id": "lock",
  "name": { "en": "Lock", "zh": "锁", "ja": "錠", "ko": "자물쇠", "es": "Candado" },
  "required": false,
  "bind": "socket",
  "socket": "lock"
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 槽位键。同一产品内唯一。用于 URL。 |
| `name` | 是 | 五语显示名。 |
| `required` | 是 | `true` 时不能隐藏，搭配必须有一个合法部件。 |
| `bind` | 是 | `skinned` 或 `socket`。 |
| `socket` | `bind=socket` 时必填 | 对应 `rig.sockets[].id`。 |
| `default_part` | 否 | 无预设、无 URL 时该槽的默认 `parts[].id`。 |

---

## 6. `parts`

```json
{
  "id": "robe-mage-blue",
  "slot": "chest",
  "name": {
    "en": "Blue Mage Robe",
    "zh": "蓝色法师长袍",
    "ja": "青い魔術師のローブ",
    "ko": "푸른 마법사 로브",
    "es": "Túnica de mago azul"
  },
  "glb": "parts/robe-mage-blue.glb",
  "thumb": "parts/robe-mage-blue.png",
  "tags": ["cloth", "mage", "long"],
  "conflicts": {
    "slots": ["legs"],
    "tags": ["fitted-legs"],
    "parts": []
  },
  "requires": {
    "slots": [],
    "tags": []
  },
  "attach": {
    "mode": "skinned"
  }
}
```

道具锁示例：

```json
{
  "id": "lock-gold",
  "slot": "lock",
  "name": { "en": "Gold Lock", "zh": "金锁", "ja": "金の錠", "ko": "금색 자물쇠", "es": "Candado dorado" },
  "glb": "parts/lock-gold.glb",
  "thumb": "parts/lock-gold.png",
  "tags": ["gold", "metal"],
  "conflicts": { "slots": [], "tags": [], "parts": [] },
  "attach": {
    "mode": "socket",
    "socket": "lock",
    "origin": "root",
    "offset": {
      "translation": [0, 0, 0],
      "rotation_xyzw": [0, 0, 0, 1],
      "scale": [1, 1, 1]
    }
  }
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 产品内唯一，用于 URL 与预设。 |
| `slot` | 是 | 所属槽位，必须在 `slots` 中存在。 |
| `name` | 是 | 五语。 |
| `glb` / `thumb` | 是 | 相对路径，分别以 `.glb`、`.png`/`.jpg`/`.webp` 结尾。 |
| `tags` | 是 | 小写短标签数组，可空。用于兼容与互斥。建议词汇见第 8 节。 |
| `conflicts` | 否 | 互斥。缺省等于三项都为空。 |
| `requires` | 否 | 依赖。缺省无依赖。 |
| `attach` | 否 | 覆盖槽位默认绑定。缺省继承 `slots[].bind` / `socket`。 |

### 6.1 互斥与依赖语义

判定一套搭配是否合法时，对每个已装备部件 *P*：

1. **槽位互斥** `conflicts.slots`：这些槽位必须为空。例如长袍 `conflicts.slots: ["legs"]`，则不能同时穿腿甲；选中长袍时，运行时应清空并禁用 `legs`。
2. **标签互斥** `conflicts.tags`：任何其它已装备部件不得带有这些标签。
3. **部件互斥** `conflicts.parts`：不得同时装备这些 `id`。
4. **依赖槽位** `requires.slots`：这些槽位必须有件。
5. **依赖标签** `requires.tags`：当前搭配里（可含自己）必须出现这些标签。
6. 互斥是**对称**的：若 A 与 B 冲突（任一侧声明即可），二者不能共存。
7. 不能把 A 产品的部件装到 B 产品。
8. `required` 槽位不能为空。
9. 同一槽位最多一件。

随机换装只在合法候选中抽样：按槽位顺序（或随机槽位序）选择不引发冲突的部件；若某 `required` 槽失败则回溯；optional 槽可抽到「空」。不要生成非法搭配后再打补丁。

---

## 7. `presets`

```json
{
  "id": "full-plate",
  "name": {
    "en": "Full Plate",
    "zh": "全身板甲",
    "ja": "フルプレート",
    "ko": "풀 플레이트",
    "es": "Armadura completa"
  },
  "parts": {
    "head": "helm-steel",
    "chest": "cuirass-steel",
    "shoulders": "pauldrons-steel",
    "arms": "gauntlets-steel",
    "legs": "greaves-steel",
    "cape": null,
    "main_hand": "sword-steel",
    "off_hand": "shield-steel"
  }
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 产品内唯一。 |
| `name` | 是 | 五语。 |
| `parts` | 是 | 键为槽位 id，值为部件 id；`null` 表示该槽为空。未出现的 optional 槽视为空；未出现的 required 槽视为非法预设。 |

所有预设必须通过第 6.1 节校验，产线和网站构建都应检查。

---

## 8. 建议标签（不强制穷尽）

角色：`cloth` `leather` `mail` `plate` `mage` `heavy` `light` `long` `fitted-legs` `closed-helm` `open-helm` `shield` `one-hand` `two-hand`

道具：`wood` `iron` `gold` `steel` `bronze` `damaged` `intact`

两手武器用 `tags: ["two-hand"]` 且 `conflicts.slots: ["off_hand"]`。

---

## 9. URL 分享

当前搭配编码在详情页查询参数里，五语路径通用，只用 id，不用显示名。

- 自定义搭配：`?outfit=head:helm-steel,chest:cuirass-steel,legs:greaves-steel,cape:,main_hand:sword-steel`
  - `slot:partId`
  - `slot:` 表示该槽为空
  - 未写出的 optional 槽视为空；未写出的 required 槽回退到 `default_part` / `default_preset`
- 预设：`?preset=full-plate`（可再被 `outfit` 覆盖个别槽位）

更换槽位、随机、套用预设后，用 `history.replaceState` 更新 URL，便于复制分享。打开带参数的链接必须还原同一套搭配；若参数非法，回退默认并去掉坏参数，不要白屏。

---

## 10. 网页运行时（实现约定）

- 使用 three.js 加载 `rig.glb` 与各部件 GLB。
- 蒙皮：按骨骼名把部件 `SkinnedMesh` 的 `skeleton` 指到主骨架，保留 `skinIndex` / `skinWeight` / inverse bind。换件时不要中断动画。
- 道具：把部件 origin 父到对应 socket，应用 `attach.offset`。
- 界面至少包括：按槽位切换（缩略图 + 名称 + 单独下载该部件 GLB）；一键随机（合法集合内）；预设搭配；当前组合下载；隐藏 optional 槽。
- 不兼容或被互斥禁用的部件在该槽的列表里不可选（可灰显）。

---

## 11. 导出

- **整套 GLB**：浏览器内用 gltf-transform 合并当前可见部件。角色导出必须带**一套**主骨骼和 `base.glb` 中的动画；所有蒙皮已绑到这套骨骼。道具导出保留 socket 层级与底座动画。贴图、UV、法线、材质不得丢失。
- **单部件 GLB**：直接提供该 `parts[].glb`（不合并骨架也可以，但文件本身应已是可绑定 / 可吸附的交付物）。
- 页面链到 Unity、Godot 换装说明（由网站实现一并撰写）。

---

## 12. 产线交付检查清单

宝箱、骑士及后续产品按此检查后再提交：

- [ ] `schema_version` 为 1，`product_id` / `kind` 正确
- [ ] 角色：全部蒙皮部件与 `rig/base.glb` 骨骼名、层级、绑定姿态一致，可重绑定
- [ ] 道具：`base.glb` 含所有声明的 socket 空节点，部件原点对齐
- [ ] 每个槽位至少 1 个部件；`required` 槽有默认件
- [ ] 每个部件有缩略图和五语名称
- [ ] `conflicts` / `requires` 已填写，预设全部合法
- [ ] 手持物或会动的盖子：socket 打在会跟着动画走的节点上
- [ ] 授权 CC0，目录中不出现生成工具署名

---

## 13. 完整示例（节选）

骑士（角色，骨架共享）：

```json
{
  "schema_version": 1,
  "product_id": "knight",
  "kind": "character",
  "name": { "en": "Knight", "zh": "骑士", "ja": "騎士", "ko": "기사", "es": "Caballero" },
  "default_preset": "full-plate",
  "rig": {
    "glb": "rig/base.glb",
    "armature": "Armature",
    "skeleton_root": "mixamorig:Hips",
    "profile": "mixamo",
    "animations": ["Idle", "Walk"],
    "sockets": [
      { "id": "main_hand", "node": "mixamorig:RightHand" },
      { "id": "off_hand", "node": "mixamorig:LeftHand" }
    ]
  },
  "slots": [
    { "id": "head", "name": { "en": "Head", "zh": "头部", "ja": "頭部", "ko": "머리", "es": "Cabeza" }, "required": false, "bind": "skinned", "default_part": "helm-steel" },
    { "id": "chest", "name": { "en": "Chest", "zh": "胸甲", "ja": "胴", "ko": "흉갑", "es": "Pecho" }, "required": true, "bind": "skinned", "default_part": "cuirass-steel" },
    { "id": "shoulders", "name": { "en": "Shoulders", "zh": "护肩", "ja": "肩", "ko": "어깨", "es": "Hombros" }, "required": false, "bind": "skinned" },
    { "id": "arms", "name": { "en": "Arms", "zh": "手臂", "ja": "腕", "ko": "팔", "es": "Brazos" }, "required": false, "bind": "skinned" },
    { "id": "legs", "name": { "en": "Legs", "zh": "腿甲", "ja": "脚", "ko": "다리", "es": "Piernas" }, "required": false, "bind": "skinned" },
    { "id": "cape", "name": { "en": "Cape", "zh": "披风", "ja": "マント", "ko": "망토", "es": "Capa" }, "required": false, "bind": "skinned" },
    { "id": "main_hand", "name": { "en": "Main Hand", "zh": "主手", "ja": "メインハンド", "ko": "주손", "es": "Mano principal" }, "required": false, "bind": "socket", "socket": "main_hand" },
    { "id": "off_hand", "name": { "en": "Off Hand", "zh": "副手", "ja": "オフハンド", "ko": "보조손", "es": "Mano secundaria" }, "required": false, "bind": "socket", "socket": "off_hand" }
  ],
  "parts": [
    {
      "id": "helm-steel",
      "slot": "head",
      "name": { "en": "Steel Helm", "zh": "钢盔", "ja": "鋼の兜", "ko": "강철 투구", "es": "Yelmo de acero" },
      "glb": "parts/helm-steel.glb",
      "thumb": "parts/helm-steel.png",
      "tags": ["plate", "heavy", "closed-helm"]
    },
    {
      "id": "robe-mage-blue",
      "slot": "chest",
      "name": { "en": "Blue Mage Robe", "zh": "蓝色法师长袍", "ja": "青いローブ", "ko": "푸른 로브", "es": "Túnica azul" },
      "glb": "parts/robe-mage-blue.glb",
      "thumb": "parts/robe-mage-blue.png",
      "tags": ["cloth", "mage", "long"],
      "conflicts": { "slots": ["legs"], "tags": [], "parts": [] }
    },
    {
      "id": "cuirass-steel",
      "slot": "chest",
      "name": { "en": "Steel Cuirass", "zh": "钢胸甲", "ja": "鋼の胴当て", "ko": "강철 흉갑", "es": "Coraza de acero" },
      "glb": "parts/cuirass-steel.glb",
      "thumb": "parts/cuirass-steel.png",
      "tags": ["plate", "heavy"]
    },
    {
      "id": "greaves-steel",
      "slot": "legs",
      "name": { "en": "Steel Greaves", "zh": "钢腿甲", "ja": "鋼のすね当て", "ko": "강철 정강이받이", "es": "Grebas de acero" },
      "glb": "parts/greaves-steel.glb",
      "thumb": "parts/greaves-steel.png",
      "tags": ["plate", "heavy", "fitted-legs"]
    },
    {
      "id": "sword-steel",
      "slot": "main_hand",
      "name": { "en": "Steel Sword", "zh": "钢剑", "ja": "鋼の剣", "ko": "강철 검", "es": "Espada de acero" },
      "glb": "parts/sword-steel.glb",
      "thumb": "parts/sword-steel.png",
      "tags": ["one-hand", "plate"]
    },
    {
      "id": "greatsword-steel",
      "slot": "main_hand",
      "name": { "en": "Steel Greatsword", "zh": "钢巨剑", "ja": "鋼の大剣", "ko": "강철 대검", "es": "Mandoble de acero" },
      "glb": "parts/greatsword-steel.glb",
      "thumb": "parts/greatsword-steel.png",
      "tags": ["two-hand"],
      "conflicts": { "slots": ["off_hand"], "tags": [], "parts": [] }
    }
  ],
  "presets": [
    {
      "id": "full-plate",
      "name": { "en": "Full Plate", "zh": "全身板甲", "ja": "フルプレート", "ko": "풀 플레이트", "es": "Armadura completa" },
      "parts": {
        "head": "helm-steel",
        "chest": "cuirass-steel",
        "legs": "greaves-steel",
        "main_hand": "sword-steel",
        "cape": null
      }
    },
    {
      "id": "mage",
      "name": { "en": "Mage", "zh": "法师", "ja": "魔術師", "ko": "마법사", "es": "Mago" },
      "parts": {
        "head": null,
        "chest": "robe-mage-blue",
        "legs": null,
        "main_hand": "sword-steel"
      }
    }
  ]
}
```

宝箱（道具，socket 对齐）：

```json
{
  "schema_version": 1,
  "product_id": "chest-wood",
  "kind": "prop",
  "name": { "en": "Wooden Chest", "zh": "木宝箱", "ja": "木の箱", "ko": "나무 상자", "es": "Cofre de madera" },
  "default_preset": "wood-gold",
  "rig": {
    "glb": "rig/base.glb",
    "profile": "custom",
    "animations": ["Open", "Close"],
    "sockets": [
      { "id": "body", "node": "socket_body" },
      { "id": "lock", "node": "socket_lock" },
      { "id": "lid", "node": "socket_lid" },
      { "id": "strap", "node": "socket_strap" }
    ]
  },
  "slots": [
    { "id": "body", "name": { "en": "Body", "zh": "箱体", "ja": "本体", "ko": "본체", "es": "Cuerpo" }, "required": true, "bind": "socket", "socket": "body", "default_part": "body-wood" },
    { "id": "lid", "name": { "en": "Lid", "zh": "箱盖", "ja": "蓋", "ko": "뚜껑", "es": "Tapa" }, "required": true, "bind": "socket", "socket": "lid", "default_part": "lid-wood" },
    { "id": "lock", "name": { "en": "Lock", "zh": "锁", "ja": "錠", "ko": "자물쇠", "es": "Candado" }, "required": false, "bind": "socket", "socket": "lock" },
    { "id": "strap", "name": { "en": "Strap", "zh": "束带", "ja": "ベルト", "ko": "띠", "es": "Correa" }, "required": false, "bind": "socket", "socket": "strap" }
  ],
  "parts": [
    { "id": "body-wood", "slot": "body", "name": { "en": "Wood Body", "zh": "木箱体", "ja": "木の本体", "ko": "나무 본체", "es": "Cuerpo de madera" }, "glb": "parts/body-wood.glb", "thumb": "parts/body-wood.png", "tags": ["wood", "intact"] },
    { "id": "lid-wood", "slot": "lid", "name": { "en": "Wood Lid", "zh": "木箱盖", "ja": "木の蓋", "ko": "나무 뚜껑", "es": "Tapa de madera" }, "glb": "parts/lid-wood.glb", "thumb": "parts/lid-wood.png", "tags": ["wood", "intact"] },
    { "id": "lock-gold", "slot": "lock", "name": { "en": "Gold Lock", "zh": "金锁", "ja": "金の錠", "ko": "금색 자물쇠", "es": "Candado dorado" }, "glb": "parts/lock-gold.glb", "thumb": "parts/lock-gold.png", "tags": ["gold", "metal"] },
    { "id": "lock-iron", "slot": "lock", "name": { "en": "Iron Lock", "zh": "铁锁", "ja": "鉄の錠", "ko": "철 자물쇠", "es": "Candado de hierro" }, "glb": "parts/lock-iron.glb", "thumb": "parts/lock-iron.png", "tags": ["iron", "metal"] },
    { "id": "strap-leather", "slot": "strap", "name": { "en": "Leather Strap", "zh": "皮带", "ja": "革ベルト", "ko": "가죽 띠", "es": "Correa de cuero" }, "glb": "parts/strap-leather.glb", "thumb": "parts/strap-leather.png", "tags": ["leather"] }
  ],
  "presets": [
    {
      "id": "wood-gold",
      "name": { "en": "Wood and Gold", "zh": "木箱金锁", "ja": "木と金", "ko": "나무와 금", "es": "Madera y oro" },
      "parts": { "body": "body-wood", "lid": "lid-wood", "lock": "lock-gold", "strap": "strap-leather" }
    }
  ]
}
```

注意：仓库里现有的旧木宝箱尚未按此拆件，不要改它的 LOD0 文件，也不要给旧文件补假部件。等新宝箱 / 骑士按本结构交付后直接接入。在此之前，网站用隐藏的占位模型跑通全流程。
