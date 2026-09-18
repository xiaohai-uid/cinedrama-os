/**
 * CineDrama OS — 20+ 爆款短剧专有角色人设与音色库 (Voice Timbre & Character Persona Library)
 * 针对微短剧戏剧冲突强、人设鲜明的特征，提供精确的角色声线映射、Edge Neural 语速/音调微调及离线多谐波声学特征
 */

export interface VoicePersona {
  id: string;
  name: string;
  gender: "male" | "female" | "other";
  category: "主角担当" | "反派对手" | "女主千金" | "诙谐特色" | "深沉威严" | "特殊声线";
  edgeVoice: string;
  rate: string; // 语速增益，如 "+5%", "-10%"
  pitch: string; // 音调增益，如 "-5Hz", "+4Hz"
  sapiGender: "Male" | "Female";
  fundamentalHz: number; // 离线多谐波声学基频 (Hz)
  timbre: string;
  keywords: string[];
}

export const VOICE_PERSONAS: VoicePersona[] = [
  // 1. 男声系列
  {
    id: "hero_male",
    name: "热血青年主角",
    gender: "male",
    category: "主角担当",
    edgeVoice: "zh-CN-YunxiNeural",
    rate: "+5%",
    pitch: "+2Hz",
    sapiGender: "Male",
    fundamentalHz: 155,
    timbre: "少年意气，坚毅昂扬，字句铿锵有力，充满不屈少年感",
    keywords: ["萧凡", "林破天", "陆炎", "主角", "少年", "少侠", "师兄", "hero", "protagonist"],
  },
  {
    id: "ceo_male",
    name: "冷酷霸道总裁",
    gender: "male",
    category: "深沉威严",
    edgeVoice: "zh-CN-YunyangNeural",
    rate: "-5%",
    pitch: "-6Hz",
    sapiGender: "Male",
    fundamentalHz: 105,
    timbre: "低沉磁性，冷冽从容，带着上位者的生人勿近压迫感",
    keywords: ["霸总", "总裁", "顾总", "陆总", "薄总", "霍总", "冷总", "ceo", "boss"],
  },
  {
    id: "villain_cold",
    name: "阴沉冷酷反派",
    gender: "male",
    category: "反派对手",
    edgeVoice: "zh-CN-YunjianNeural",
    rate: "-8%",
    pitch: "-4Hz",
    sapiGender: "Male",
    fundamentalHz: 120,
    timbre: "阴鸷沙哑，语调微扬带着轻蔑嘲弄，笑里藏刀令人胆寒",
    keywords: ["反派", "执法执事", "赵长老", "杀手", "刺客", "魔尊", "邪修", "villain", "antagonist"],
  },
  {
    id: "master_immortal",
    name: "出尘清冷仙尊",
    gender: "male",
    category: "深沉威严",
    edgeVoice: "zh-CN-YunxiNeural",
    rate: "-10%",
    pitch: "+4Hz",
    sapiGender: "Male",
    fundamentalHz: 145,
    timbre: "飘渺出尘，温润如玉而暗含神威，不惹凡尘烟火气",
    keywords: ["师尊", "仙尊", "老祖", "白月光", "学霸", "道尊", "宗主", "immortal", "master"],
  },
  {
    id: "warm_male",
    name: "深情隐忍暖男",
    gender: "male",
    category: "主角担当",
    edgeVoice: "zh-CN-YunyangNeural",
    rate: "-3%",
    pitch: "-2Hz",
    sapiGender: "Male",
    fundamentalHz: 135,
    timbre: "温润宽厚，深情克制，嗓音带有治愈人心的温暖共鸣",
    keywords: ["男二", "学长", "哥哥", "守护者", "深情", "温柔", "warm"],
  },
  {
    id: "emperor",
    name: "九五之尊帝王",
    gender: "male",
    category: "深沉威严",
    edgeVoice: "zh-CN-YunjianNeural",
    rate: "-12%",
    pitch: "-8Hz",
    sapiGender: "Male",
    fundamentalHz: 95,
    timbre: "威严宏大，声如洪钟，言出法随的天子威仪与肃穆气魄",
    keywords: ["皇帝", "陛下", "天子", "国公", "藩王", "皇上", "emperor", "king"],
  },
  {
    id: "warrior_tough",
    name: "铁血硬汉战神",
    gender: "male",
    category: "主角担当",
    edgeVoice: "zh-CN-YunjianNeural",
    rate: "+0%",
    pitch: "-7Hz",
    sapiGender: "Male",
    fundamentalHz: 110,
    timbre: "浑厚沉着，杀伐果决，带有战火硝烟磨砺出的粗粝质感",
    keywords: ["战神", "将军", "兵王", "硬汉", "探长", "阿豪", "陈拓", "commander", "warrior"],
  },
  {
    id: "loyal_guard",
    name: "忠勇近卫特助",
    gender: "male",
    category: "主角担当",
    edgeVoice: "zh-CN-YunyangNeural",
    rate: "+4%",
    pitch: "-3Hz",
    sapiGender: "Male",
    fundamentalHz: 130,
    timbre: "干脆利落，忠心耿耿，汇报干练从容不带私人情绪",
    keywords: ["特助", "秘书", "侍卫", "近卫", "手下", "助理", "周峰", "guard"],
  },
  {
    id: "comic_relief",
    name: "诙谐搞笑死党",
    gender: "male",
    category: "诙谐特色",
    edgeVoice: "zh-CN-YunxiaNeural",
    rate: "+15%",
    pitch: "+5Hz",
    sapiGender: "Male",
    fundamentalHz: 175,
    timbre: "语速飞快，自带喜感逗趣，生动逗乐的打工人死党声线",
    keywords: ["死党", "胖子", "小弟", "同桌", "打工人", "搞笑", "喜剧", "comic", "funny"],
  },
  {
    id: "elder_wise",
    name: "苍茫世外长者",
    gender: "male",
    category: "深沉威严",
    edgeVoice: "zh-CN-YunjianNeural",
    rate: "-15%",
    pitch: "-5Hz",
    sapiGender: "Male",
    fundamentalHz: 115,
    timbre: "沧桑深邃，阅尽世事沧桑，语调徐缓绵长充满先知哲思",
    keywords: ["长老", "爷爷", "太上长老", "白发老者", "智者", "elder", "sage"],
  },

  // 2. 女声系列
  {
    id: "heroine_sweet",
    name: "灵动甜美女主",
    gender: "female",
    category: "女主千金",
    edgeVoice: "zh-CN-XiaoxiaoNeural",
    rate: "+3%",
    pitch: "+3Hz",
    sapiGender: "Female",
    fundamentalHz: 235,
    timbre: "清澈明媚，如林间清泉，娇俏灵动而不失真诚坚定",
    keywords: ["女主", "师妹", "灵儿", "宋温暖", "甜妹", "学妹", "校花", "heroine", "sweet"],
  },
  {
    id: "rich_heiress",
    name: "高傲豪门千金",
    gender: "female",
    category: "女主千金",
    edgeVoice: "zh-CN-XiaoxiaoNeural",
    rate: "-4%",
    pitch: "-2Hz",
    sapiGender: "Female",
    fundamentalHz: 215,
    timbre: "清雅矜持，从容自信，带着名门望族的端庄与高贵教养",
    keywords: ["千金", "大小姐", "苏清颜", "豪门女", "名媛", "heiress", "princess"],
  },
  {
    id: "mature_female",
    name: "冷艳知性御姐",
    gender: "female",
    category: "主角担当",
    edgeVoice: "zh-CN-XiaoxiaoNeural",
    rate: "-6%",
    pitch: "-4Hz",
    sapiGender: "Female",
    fundamentalHz: 200,
    timbre: "冷艳干练，磁性低回，成熟从容具有强大的职场女王气场",
    keywords: ["御姐", "女总裁", "苏总", "师姐", "女强人", "律师", "mature", "boss_lady"],
  },
  {
    id: "playful_girl",
    name: "古灵精怪少女",
    gender: "female",
    category: "诙谐特色",
    edgeVoice: "zh-CN-XiaoyiNeural",
    rate: "+12%",
    pitch: "+6Hz",
    sapiGender: "Female",
    fundamentalHz: 260,
    timbre: "清脆活泼，俏皮灵动，鬼马机灵充满无厘头搞怪活力",
    keywords: ["少女", "闺蜜", "小师妹", "安安", "千夏", "机灵", "playful", "girl"],
  },
  {
    id: "femme_fatale",
    name: "深宫蛇蝎美人",
    gender: "female",
    category: "反派对手",
    edgeVoice: "zh-CN-XiaoxiaoNeural",
    rate: "-8%",
    pitch: "-3Hz",
    sapiGender: "Female",
    fundamentalHz: 210,
    timbre: "慵懒魅惑，柔媚如丝却暗藏淬毒杀机，令人不寒而栗",
    keywords: ["贵妃", "反派女", "魔女", "沈氏", "蛇蝎", "妖女", "妾室", "femme_fatale"],
  },
  {
    id: "intellectual_female",
    name: "温婉民国才女",
    gender: "female",
    category: "女主千金",
    edgeVoice: "zh-CN-XiaoxiaoNeural",
    rate: "-7%",
    pitch: "+0Hz",
    sapiGender: "Female",
    fundamentalHz: 220,
    timbre: "书香素雅，如兰如蕙，从容不迫的知性大家闺秀风范",
    keywords: ["白薇", "才女", "老师", "医生", "书卷", "温婉", "intellectual"],
  },
  {
    id: "warrior_female",
    name: "英姿飒爽侠女",
    gender: "female",
    category: "主角担当",
    edgeVoice: "zh-CN-XiaoyiNeural",
    rate: "+4%",
    pitch: "-1Hz",
    sapiGender: "Female",
    fundamentalHz: 215,
    timbre: "英武坚毅，干脆利落，剑啸江湖不让须眉的巾帼英气",
    keywords: ["侠女", "女捕头", "女军官", "特工女", "刺客女", "warrior_female"],
  },
  {
    id: "mother_caring",
    name: "慈爱温和长辈",
    gender: "female",
    category: "深沉威严",
    edgeVoice: "zh-CN-XiaoxiaoNeural",
    rate: "-10%",
    pitch: "-2Hz",
    sapiGender: "Female",
    fundamentalHz: 195,
    timbre: "慈祥宽厚，语重心长，饱含母爱与温暖包容的亲情声线",
    keywords: ["母亲", "太后", "夫人", "婆婆", "姑姑", "长辈", "mother"],
  },

  // 3. 旁白与特色声线
  {
    id: "narrator_epic",
    name: "沉浸史诗旁白",
    gender: "other",
    category: "特殊声线",
    edgeVoice: "zh-CN-YunjianNeural",
    rate: "-8%",
    pitch: "-5Hz",
    sapiGender: "Male",
    fundamentalHz: 110,
    timbre: "宏大深邃，如娓娓道来的电影旁白，铺垫宿命与戏剧张力",
    keywords: ["旁白", "叙述", "解说", "画外音", "背景音", "narrator"],
  },
  {
    id: "ai_core",
    name: "未来机械智脑",
    gender: "other",
    category: "特殊声线",
    edgeVoice: "zh-CN-XiaoxiaoNeural",
    rate: "+0%",
    pitch: "+0Hz",
    sapiGender: "Female",
    fundamentalHz: 230,
    timbre: "冰冷理性，客观严密，不带任何人类情感波动的电子合成感",
    keywords: ["系统", "ai", "智脑", "主脑", "奥丁", "机器人", "core"],
  },
  {
    id: "dialect_comedy",
    name: "东北方言喜剧",
    gender: "female",
    category: "诙谐特色",
    edgeVoice: "zh-CN-liaoning-XiaobeiNeural",
    rate: "+8%",
    pitch: "+0Hz",
    sapiGender: "Female",
    fundamentalHz: 225,
    timbre: "泼辣幽默，地道爽朗，喜感爆棚的生活剧王牌声线",
    keywords: ["东北", "大妈", "老姑", "大婶", "喜剧女", "dialect"],
  },
];

/**
 * 获取完整角色音色库
 */
export function listVoicePersonas(): VoicePersona[] {
  return VOICE_PERSONAS;
}

/**
 * 智能模糊匹配角色人设音色
 * 根据角色名字、台词身份、性格标签推断最佳短剧专有音色
 */
export function resolveVoicePersona(inputRoleOrVoice?: string): VoicePersona {
  if (!inputRoleOrVoice) {
    return VOICE_PERSONAS[0]; // 默认热血主角
  }

  const clean = inputRoleOrVoice.trim().toLowerCase();

  // 1. 精确 ID 匹配
  const byId = VOICE_PERSONAS.find((p) => p.id === clean);
  if (byId) return byId;

  // 2. 精确名称匹配
  const byName = VOICE_PERSONAS.find((p) => p.name.includes(clean) || clean.includes(p.name));
  if (byName) return byName;

  // 3. 关键词特征匹配
  for (const p of VOICE_PERSONAS) {
    for (const kw of p.keywords) {
      if (clean.includes(kw.toLowerCase())) {
        return p;
      }
    }
  }

  // 4. 性别特征降级推断
  if (clean.includes("女") || clean.includes("妹") || clean.includes("姐") || clean.includes("娘") || clean.includes("female")) {
    return VOICE_PERSONAS.find((p) => p.id === "heroine_sweet")!;
  }

  // 5. 默认回退
  return VOICE_PERSONAS[0];
}
