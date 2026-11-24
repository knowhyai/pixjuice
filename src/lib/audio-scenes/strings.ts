import type { Locale } from "../i18n";

type Copy = {
  title: string;
  lede: string;
  scenes: string;
  filters: Record<string, string>;
  results: (count: number) => string;
  loadingCatalog: string;
  catalogError: string;
  retry: string;
  play: string;
  stop: string;
  loading: string;
  playing: string;
  error: string;
  download: string;
  commercial: string;
  attribution: string;
  details: string;
  packLicense: string;
  assetId: string;
  eventTags: string;
  back: string;
  coins: string;
  metal: string;
  credit: string;
  legal: string;
  synth: string;
  variant: (name: string, number: string) => string;
  names?: readonly string[];
};

export const BRAND = "PixJuice";
export const CC0 = "CC0 1.0";
export const CREDIT_SITE = "www.kenney.nl";

export const STRINGS: Record<Locale, Copy> = {
  en: {
    title: "Game sound effects by scene",
    lede: "Choose a scene, preview recorded game sound effects, and download the original OGG files.",
    scenes: "Filter by scene",
    filters: { all: "All", ui: "Confirm / back / error", reward: "Reward coins", weapon: "Draw knife / metal click", footstep: "Footstep surfaces", hit: "Hit weight / material", environment: "Door open / close" },
    results: count => `${count} clips`,
    loadingCatalog: "Loading the sound library…",
    catalogError: "Could not load the sound library.",
    retry: "Try again",
    play: "Play", stop: "Stop", loading: "Loading audio…", playing: "Playing",
    error: "Could not load or play this OGG. Try again or download the file.",
    download: "Download OGG",
    commercial: "Commercial use allowed", attribution: "Attribution not required",
    details: "Asset details", packLicense: "Pack license", assetId: "Asset ID", eventTags: "Event tags",
    back: "Back is the official label. ui.cancel is an additional suggested use.",
    coins: "The official names refer to handling coins. reward.pickup is a suggested use, not an official coin pickup label.",
    metal: "The official name is metalClick. Use as a reload sound is unverified.",
    credit: "Source: Kenney",
    legal: "Permission for commercial use does not rule out every legal risk.",
    synth: "Synthesize your own effects in the Audio Envelope lab.",
    variant: (name, number) => `${name} (variant ${number})`,
  },
  zh: {
    title: "按场景分的游戏音效",
    lede: "选择场景，试听录制的游戏音效，并下载原始 OGG 文件。",
    scenes: "按场景筛选",
    filters: { all: "全部", ui: "确认 / 返回 / 错误", reward: "奖励硬币", weapon: "抽刀 / 金属卡扣", footstep: "脚步材质", hit: "命中轻重 / 材质", environment: "开 / 关门" },
    results: count => `${count} 段音效`,
    loadingCatalog: "正在加载音效库…",
    catalogError: "无法加载音效库。",
    retry: "重试",
    play: "播放", stop: "停止", loading: "正在加载音频…", playing: "正在播放",
    error: "无法加载或播放这段 OGG。请重试或下载文件。",
    download: "下载 OGG",
    commercial: "允许商用", attribution: "无需署名",
    details: "资源详情", packLicense: "素材包许可", assetId: "资源 ID", eventTags: "事件标签",
    back: "官方名称指返回。ui.cancel 是额外建议的用途。",
    coins: "官方名称指拿动硬币。reward.pickup 是建议用途，并非官方的拾取硬币标签。",
    metal: "官方名称为 metalClick。作为装填音效的用途尚未验证。",
    credit: "来源：Kenney",
    legal: "允许商用并不代表没有其他法律风险。",
    synth: "在音频包络实验室合成自己的音效。",
    variant: (name, number) => `${name}（变体 ${number}）`,
  },
  ja: {
    title: "シーン別ゲーム効果音",
    lede: "シーンを選び、収録されたゲーム効果音を試聴して、元の OGG ファイルをダウンロードできます。",
    scenes: "シーンで絞り込む",
    filters: { all: "すべて", ui: "決定 / 戻る / エラー", reward: "報酬コイン", weapon: "ナイフを抜く / 金属のクリック", footstep: "足音の床材", hit: "ヒットの強さ / 素材", environment: "ドアの開閉" },
    results: count => `${count} 件の効果音`,
    loadingCatalog: "効果音ライブラリを読み込み中…",
    catalogError: "効果音ライブラリを読み込めませんでした。",
    retry: "再試行",
    play: "再生", stop: "停止", loading: "音声を読み込み中…", playing: "再生中",
    error: "この OGG を読み込み、または再生できませんでした。再試行するか、ファイルをダウンロードしてください。",
    download: "OGG をダウンロード",
    commercial: "商用利用可", attribution: "クレジット表記不要",
    details: "素材の詳細", packLicense: "パックのライセンス", assetId: "素材 ID", eventTags: "イベントタグ",
    back: "公式名は「戻る」です。ui.cancel は追加の用途案です。",
    coins: "公式名はコインを扱う動作を指します。reward.pickup は用途案で、公式のコイン取得ラベルではありません。",
    metal: "公式名は metalClick です。リロード音としての用途は未確認です。",
    credit: "提供元：Kenney",
    legal: "商用利用が可能でも、すべての法的リスクがなくなるわけではありません。",
    synth: "Audio Envelope ラボで効果音を合成できます。",
    variant: (name, number) => `${name}（バリエーション ${number}）`,
    names: ["決定", "戻る", "エラー", "コインを扱う", "ナイフを抜く", "金属のクリック", "木の床の足音", "コンクリートの足音", "汎用の衝撃・軽", "パンチの衝撃・重", "金属の衝撃・重", "ドアを開ける", "ドアを閉める"],
  },
  ko: {
    title: "장면별 게임 효과음",
    lede: "장면을 골라 녹음된 게임 효과음을 미리 듣고 원본 OGG 파일을 다운로드하세요.",
    scenes: "장면별로 필터링",
    filters: { all: "전체", ui: "확인 / 뒤로 / 오류", reward: "보상 코인", weapon: "칼 꺼내기 / 금속 클릭", footstep: "발걸음 바닥 재질", hit: "타격 강도 / 재질", environment: "문 열기 / 닫기" },
    results: count => `효과음 ${count}개`,
    loadingCatalog: "효과음 라이브러리 불러오는 중…",
    catalogError: "효과음 라이브러리를 불러올 수 없습니다.",
    retry: "다시 시도",
    play: "재생", stop: "정지", loading: "오디오 불러오는 중…", playing: "재생 중",
    error: "이 OGG를 불러오거나 재생할 수 없습니다. 다시 시도하거나 파일을 다운로드하세요.",
    download: "OGG 다운로드",
    commercial: "상업적 이용 가능", attribution: "출처 표기 불필요",
    details: "에셋 세부 정보", packLicense: "팩 라이선스", assetId: "에셋 ID", eventTags: "이벤트 태그",
    back: "공식 명칭은 뒤로 가기를 뜻합니다. ui.cancel은 추가로 제안된 용도입니다.",
    coins: "공식 명칭은 동전을 다루는 동작을 뜻합니다. reward.pickup은 제안된 용도이며 공식 코인 획득 라벨이 아닙니다.",
    metal: "공식 명칭은 metalClick입니다. 재장전 효과음으로서의 용도는 확인되지 않았습니다.",
    credit: "출처: Kenney",
    legal: "상업적 이용이 가능해도 모든 법적 위험이 사라지는 것은 아닙니다.",
    synth: "Audio Envelope 실험실에서 효과음을 합성할 수 있습니다.",
    variant: (name, number) => `${name}(변형 ${number})`,
    names: ["확인", "뒤로", "오류", "동전 다루기", "칼 꺼내기", "금속 클릭", "나무 바닥 발걸음", "콘크리트 발걸음", "일반 충격 · 가벼움", "주먹 타격 · 무거움", "금속 충격 · 무거움", "문 열기", "문 닫기"],
  },
  es: {
    title: "Efectos de sonido para juegos por escena",
    lede: "Elige una escena, escucha los efectos grabados y descarga los archivos OGG originales.",
    scenes: "Filtrar por escena",
    filters: { all: "Todos", ui: "Confirmar / volver / error", reward: "Monedas de recompensa", weapon: "Sacar cuchillo / clic metálico", footstep: "Superficies de pisadas", hit: "Intensidad / material del impacto", environment: "Abrir / cerrar puertas" },
    results: count => `${count} clips`,
    loadingCatalog: "Cargando la biblioteca de sonidos…",
    catalogError: "No se pudo cargar la biblioteca de sonidos.",
    retry: "Reintentar",
    play: "Reproducir", stop: "Detener", loading: "Cargando audio…", playing: "Reproduciendo",
    error: "No se pudo cargar o reproducir este OGG. Vuelve a intentarlo o descarga el archivo.",
    download: "Descargar OGG",
    commercial: "Uso comercial permitido", attribution: "No requiere atribución",
    details: "Detalles del recurso", packLicense: "Licencia del paquete", assetId: "ID del recurso", eventTags: "Etiquetas de evento",
    back: "El nombre oficial indica volver. ui.cancel es un uso adicional sugerido.",
    coins: "Los nombres oficiales se refieren a manipular monedas. reward.pickup es un uso sugerido, no una etiqueta oficial de recogida de monedas.",
    metal: "El nombre oficial es metalClick. Su uso como sonido de recarga no está verificado.",
    credit: "Fuente: Kenney",
    legal: "El permiso de uso comercial no elimina todos los riesgos legales.",
    synth: "Sintetiza tus propios efectos en el laboratorio Audio Envelope.",
    variant: (name, number) => `${name} (variante ${number})`,
    names: ["Confirmación", "Volver", "Error", "Manipular monedas", "Sacar cuchillo", "Clic metálico", "Pisada en madera", "Pisada en hormigón", "Impacto genérico ligero", "Impacto de puñetazo fuerte", "Impacto metálico fuerte", "Abrir puerta", "Cerrar puerta"],
  },
};

const nameGroups = [
  "Confirmation", "Back", "Error", "Handle coins", "Draw knife", "Metal click",
  "Footstep wood", "Footstep concrete", "Generic impact light", "Punch impact heavy",
  "Metal impact heavy", "Door open", "Door close",
];

export function clipName(locale: Locale, clip: { name_en: string; name_zh: string }): string {
  if (locale === "zh") return clip.name_zh;
  const [name, variant] = clip.name_en.split(" (variant ");
  const copy = STRINGS[locale];
  const translated = copy.names?.[nameGroups.indexOf(name)];
  if (!translated) return clip.name_en;
  return variant ? copy.variant(translated, variant.slice(0, -1)) : translated;
}
