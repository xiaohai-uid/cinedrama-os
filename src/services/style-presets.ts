/**
 * CineDrama OS — 12 大微短剧核心题材画风预设库
 * 覆盖国内主流短剧、抖音快手与出海微短剧爆款题材，提供专业的视觉提示词增强因子、色彩滤镜与构图指导
 */

export interface StylePreset {
  id: string;
  name: string;
  category: "古风修真" | "科幻悬疑" | "现代都市" | "奇幻热血" | "年代剧情";
  emoji: string;
  label: string;
  description: string;
  promptEnhancers: string[];
  negativePrompt: string;
  defaultFilter: "cinematic_teal_orange" | "vintage_film" | "noir_bw" | "cyberpunk_neon" | "warm_glow" | "normal";
  sampleRoles: Array<{ role: string; suggestedVoice: string }>;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "xianxia",
    name: "国风修仙玄幻",
    category: "古风修真",
    emoji: "🇨🇳",
    label: "国风修仙玄幻 (高精古风电影感)",
    description: "仙气缥缈，金光剑气，水墨流韵，浩渺苍穹对峙，院线级逆光氛围",
    promptEnhancers: [
      "东方仙侠玄幻美学",
      "流云飞袂飘逸长袍",
      "周身环绕微弱灵光与金石符文",
      "虚实相生水墨气韵",
      "电影级丁达尔光线与深远景深",
      "8K 超高清极致画质",
    ],
    negativePrompt: "现代服装, 粗糙杂乱背景, 塑料感, 结构畸变, 低清低模",
    defaultFilter: "cinematic_teal_orange",
    sampleRoles: [
      { role: "萧凡 (坚毅少侠)", suggestedVoice: "hero_male" },
      { role: "执法执事 (阴鸷对手)", suggestedVoice: "villain_cold" },
      { role: "灵儿师妹 (清雅白月光)", suggestedVoice: "master_immortal" },
    ],
  },
  {
    id: "anime",
    name: "热血日漫番剧",
    category: "奇幻热血",
    emoji: "🇯🇵",
    label: "热血日漫番剧 (新海诚光影风)",
    description: "高饱和度蔚蓝晴空，微风拂动发丝，强对比阴影，日漫黄金时代画风",
    promptEnhancers: [
      "高水准剧场版动画质感",
      "新海诚风格清澈透光云层",
      "高饱和度清透色彩",
      "鲜明人物轮廓光",
      "微风与粒子光斑飞舞",
      "精美原画手绘细节",
    ],
    negativePrompt: "写实真人照片, 灰暗浑浊, 3D塑料CG, 杂乱噪点",
    defaultFilter: "warm_glow",
    sampleRoles: [
      { role: "星野 (热血少年)", suggestedVoice: "hero_male" },
      { role: "千夏 (灵动少女)", suggestedVoice: "playful_girl" },
    ],
  },
  {
    id: "cyberpunk",
    name: "赛博科幻都市",
    category: "科幻悬疑",
    emoji: "🌃",
    label: "赛博科幻都市 (霓虹光影暗黑感)",
    description: "雨夜九龙城寨街景，全息粉紫霓虹穿透水雾，机械义肢冷光反光",
    promptEnhancers: [
      "赛博朋克近未来美学",
      "湿漉反光沥青路面",
      "青紫交织的高饱和霓虹广告牌",
      "精细机械义体构件与发光电缆",
      "暗夜阴雨与体积雾气穿透",
      "好莱坞科幻电影构图",
    ],
    negativePrompt: "古风农田, 白天强光, 低饱和无光, 平面无景深",
    defaultFilter: "cyberpunk_neon",
    sampleRoles: [
      { role: "十七 (赛博义眼刺客)", suggestedVoice: "villain_cold" },
      { role: "天女 (机械智脑化身)", suggestedVoice: "ai_core" },
    ],
  },
  {
    id: "cinematic",
    name: "3D 超写实短剧",
    category: "现代都市",
    emoji: "🎬",
    label: "3D 超写实短剧 (好莱坞级电影质感)",
    description: "虚幻引擎5真实渲染，真实皮肤毛孔与微表面光泽，体积光影与浅景深",
    promptEnhancers: [
      "虚幻引擎5顶级写实渲染",
      "超精细微表面皮肤质感",
      "好莱坞摄影机变形宽银幕电影景深",
      "逼真面部微表情与眼神光",
      "真实织物褶皱与金属微反射",
      "物理精准光线追踪",
    ],
    negativePrompt: "2D二次元卡通, 纸片人假脸, 油腻塑料皮, 低模模糊",
    defaultFilter: "cinematic_teal_orange",
    sampleRoles: [
      { role: "陆炎 (沉稳主角)", suggestedVoice: "hero_male" },
      { role: "指挥官 (冷峻执行者)", suggestedVoice: "warrior_tough" },
    ],
  },
  {
    id: "ceo_romance",
    name: "现代霸总豪门",
    category: "现代都市",
    emoji: "👔",
    label: "现代霸总豪门 (奢华权谋与暗涌)",
    description: "顶级高层落地窗俯瞰都会夜景，冷灰高级定制西装，法式庄园与冷峻对峙",
    promptEnhancers: [
      "顶级现代豪门奢华质感",
      "高定黑曜石冷灰色调西装",
      "通透落地窗俯瞰都会璀璨夜景",
      "大理石与香槟金微奢装潢",
      "沉稳内敛的冷峻电影逆光",
      "高端名媛精致妆造",
    ],
    negativePrompt: "破败旧房, 乡土农具, 廉价服饰, 粗糙杂乱",
    defaultFilter: "cinematic_teal_orange",
    sampleRoles: [
      { role: "陆霆骁 (冷酷霸总)", suggestedVoice: "ceo_male" },
      { role: "苏清颜 (坚韧千金)", suggestedVoice: "rich_heiress" },
      { role: "特助周峰 (干练从容)", suggestedVoice: "loyal_guard" },
    ],
  },
  {
    id: "palace_intrigue",
    name: "古代宫斗权谋",
    category: "古风修真",
    emoji: "👑",
    label: "古代宫斗权谋 (深宫禁闱步步惊心)",
    description: "紫禁城朱红宫墙，金丝刺绣宫装，幽暗烛火掩映下的眼神交锋，深邃压抑",
    promptEnhancers: [
      "紫禁城沉稳古典厚重质感",
      "朱红宫墙与琉璃飞檐",
      "繁复精致苏绣丝绸凤袍",
      "摇曳宫廷烛火与冷暗阴影",
      "步步惊心的微表情杀气张力",
      "正统历史正剧电影构图",
    ],
    negativePrompt: "现代元素, 荧光艳俗现代妆, 塑料头饰, 粗糙摄影棚",
    defaultFilter: "warm_glow",
    sampleRoles: [
      { role: "贵妃沈氏 (深宫蛇蝎)", suggestedVoice: "femme_fatale" },
      { role: "皇帝 (九五之尊)", suggestedVoice: "emperor" },
      { role: "暗卫青影 (忠勇死士)", suggestedVoice: "loyal_guard" },
    ],
  },
  {
    id: "wasteland_survival",
    name: "末世废土生存",
    category: "科幻悬疑",
    emoji: "☢️",
    label: "末世废土生存 (荒芜绝境工业硬核)",
    description: "狂暴沙尘暴席卷生锈钢铁废墟，防毒面具与外骨骼，绝地求生的苍凉冷冽",
    promptEnhancers: [
      "废土末日朋克硬核质感",
      "荒凉狂沙与风蚀工业残骸",
      "防毒面具与磨损外骨骼护具",
      "干涸开裂大地与阴霾天空",
      "沉重金属擦痕与硝烟余烬",
      "纪实废土摄影大片构图",
    ],
    negativePrompt: "阳光明媚, 绿树草地, 光鲜靓丽, 洁净礼服",
    defaultFilter: "vintage_film",
    sampleRoles: [
      { role: "陈拓 (战术拾荒者)", suggestedVoice: "warrior_tough" },
      { role: "零号 (异能流浪少女)", suggestedVoice: "playful_girl" },
    ],
  },
  {
    id: "suspense_republic",
    name: "民国悬疑谍战",
    category: "年代剧情",
    emoji: "🕵️",
    label: "民国悬疑谍战 (十里洋场暗夜交锋)",
    description: "旧上海阴雨巷道，黑伞风衣礼帽，斑驳弄堂昏黄路灯下的暗号对接",
    promptEnhancers: [
      "老上海复古年代胶片质感",
      "雨夜湿漉的青石板街道",
      "黑色双排扣羊绒风衣与礼帽",
      "老式路灯投射的昏黄圆光",
      "香烟青雾缭绕与戒备眼神",
      "经典黑色悬疑电影影调",
    ],
    negativePrompt: "高科技霓虹, 现代智能手机, 宽马路玻璃大厦",
    defaultFilter: "noir_bw",
    sampleRoles: [
      { role: "沈从安 (双面特工)", suggestedVoice: "villain_cold" },
      { role: "白薇 (名伶密报员)", suggestedVoice: "intellectual_female" },
    ],
  },
  {
    id: "urban_comedy",
    name: "现代都市轻喜",
    category: "现代都市",
    emoji: "☕",
    label: "现代都市轻喜 (温馨治愈人间烟火)",
    description: "温馨自然光洒满明亮客厅，原木绿植与咖啡热气，轻松愉悦的生活切片",
    promptEnhancers: [
      "温馨自然明亮日光质感",
      "日式宜家原木清新色调",
      "治愈系阳光透过薄纱窗帘",
      "生活气息浓郁的咖啡与绿植",
      "生动自然的日常喜悦神情",
      "现代都会轻喜剧电影质感",
    ],
    negativePrompt: "阴暗压抑, 恐怖惊悚, 浑浊颗粒, 废墟残骸",
    defaultFilter: "warm_glow",
    sampleRoles: [
      { role: "林小凡 (乐观打工人)", suggestedVoice: "comic_relief" },
      { role: "安安 (毒舌闺蜜)", suggestedVoice: "playful_girl" },
    ],
  },
  {
    id: "retro_hk_action",
    name: "复古港风警匪",
    category: "年代剧情",
    emoji: "🔫",
    label: "复古港风警匪 (九龙风云热血胶片)",
    description: "九龙城寨拥挤招牌天际线，胶片颗粒噪点，雨中持枪对决与兄弟情仇",
    promptEnhancers: [
      "80年代经典港片胶片质感",
      "重度胶片颗粒与暗角",
      "九龙密集招牌与窄道阴影",
      "大反差明暗对比与强面光",
      "飞溅雨水与手枪金属反光",
      "杜琪峰式戏剧站位构图",
    ],
    negativePrompt: "二次元日漫, 扁平极简, 现代粉嫩磨皮",
    defaultFilter: "vintage_film",
    sampleRoles: [
      { role: "阿豪 (浴血探长)", suggestedVoice: "warrior_tough" },
      { role: "东哥 (社团枭雄)", suggestedVoice: "villain_cold" },
    ],
  },
  {
    id: "sweet_pet_romance",
    name: "青春甜宠校园",
    category: "现代都市",
    emoji: "🌸",
    label: "青春甜宠校园 (微风初恋纯爱光芒)",
    description: "樱花漫天操场微风，纯白衬衫逆光发丝透亮，心跳加速的青春回眸",
    promptEnhancers: [
      "纯爱校园微风初恋氛围",
      "温暖柔和逆光发丝金边",
      "樱花花瓣散落与绿茵操场",
      "少年感白衬衫与微焦空气感",
      "清澈动人的青涩眼眸与笑意",
      "小清新青春偶像剧画质",
    ],
    negativePrompt: "血腥暴力, 阴暗丧尸, 浓妆艳抹, 苍老衰败",
    defaultFilter: "warm_glow",
    sampleRoles: [
      { role: "江淮 (高冷学霸)", suggestedVoice: "master_immortal" },
      { role: "宋温暖 (软萌同桌)", suggestedVoice: "heroine_sweet" },
    ],
  },
  {
    id: "interstellar_mecha",
    name: "银河星际机甲",
    category: "科幻悬疑",
    emoji: "🚀",
    label: "银河星际机甲 (深空史诗重装机械)",
    description: "万米星际母舰舷窗外的瑰丽星云，重型外骨骼装甲蓝火推进，宏大史诗",
    promptEnhancers: [
      "硬核深空星际歌剧美学",
      "壮丽深空星云与行星环背景",
      "合金装甲刻线与粒子喷射尾焰",
      "全景战术全息HUD光影映射",
      "万吨级钢铁战舰巨构压迫感",
      "科幻史诗大片宽幅构图",
    ],
    negativePrompt: "古代木屋, 农家小院, 传统马车, 模糊手绘",
    defaultFilter: "cinematic_teal_orange",
    sampleRoles: [
      { role: "雷诺 (星舰舰长)", suggestedVoice: "ceo_male" },
      { role: "主控AI (奥丁系统)", suggestedVoice: "ai_core" },
    ],
  },
];

/**
 * 获取所有支持的预设列表
 */
export function listStylePresets(): StylePreset[] {
  return STYLE_PRESETS;
}

/**
 * 获取指定预设，若不存在则回退至默认国风修仙
 */
export function getStylePreset(id?: string): StylePreset {
  if (!id) return STYLE_PRESETS[0];
  const found = STYLE_PRESETS.find((p) => p.id === id);
  return found || STYLE_PRESETS[0];
}

/**
 * 依据选择的画风预设，为分镜图像提示词注入对应的艺术特征增强词
 */
export function enrichPromptWithStyle(basePrompt: string, styleId?: string): string {
  const preset = getStylePreset(styleId);
  const coreEnhancers = preset.promptEnhancers.slice(0, 4).join("，");
  return `${basePrompt}，${coreEnhancers}，8K高分辨率超精细`;
}
