export const HERO_CANVAS = Object.freeze({ width: 1024, height: 1024, baseline: 900 });

const hero = (id, name, color, gender, artBrief, attacks) => Object.freeze({ id, name, kind: 'human', color, gender, artBrief, attacks: Object.freeze(attacks) });
const attack = (callout, glyph, color) => Object.freeze({ callout, glyph, color });

export const CAMPUS_HEROES = Object.freeze([
  hero('basketball-ace', '籃球王牌', '#ff8a2a', 'female', '籃球王牌；橘白球衣與護腕；高束馬尾髮型；發光籃球配件；珊瑚橘點綴色。', { energy: attack('灌籃光波', '球', '#ff9f1c'), punch: attack('禁區重拳', '拳', '#ff6b35'), kick: attack('滑步飛踢', '踢', '#f7d154') }),
  hero('track-sprinter', '田徑快手', '#25c4ff', 'male', '田徑快手；青藍競速背心與短褲；俐落側分短髮；速度護目鏡配件；湖水藍點綴色。', { energy: attack('加速氣流', '風', '#62e5ff'), punch: attack('衝刺直拳', '拳', '#1596ff'), kick: attack('跨欄飛踢', '踢', '#b6f344') }),
  hero('street-dancer', '街舞高手', '#f43aa0', 'female', '街舞高手；紫黑街舞外套與高筒球鞋；蓬鬆雙髮髻輪廓；霓虹耳機配件；桃紅色點綴色。', { energy: attack('節拍光彈', '♪', '#ff64cb'), punch: attack('旋轉勾拳', '拳', '#ff3d89'), kick: attack('倒立踢擊', '踢', '#9657ff') }),
  hero('kendo-captain', '劍道社長', '#4061d8', 'male', '劍道社長；深藍劍道服與護具；整齊高束武士髮髻；竹劍配件；靛青色點綴色。', { energy: attack('竹劍光波', '剣', '#8ab8ff'), punch: attack('突進拳', '拳', '#4b72ef'), kick: attack('踏步飛踢', '踢', '#d5e4ff') }),
  hero('science-maker', '科學發明家', '#3cc88e', 'female', '科學發明家；薄荷實驗背心與運動短裙；捲翹短鮑伯髮型；護目鏡與發明手套配件；薄荷綠點綴色。', { energy: attack('電路光束', '⚡', '#5df2bb'), punch: attack('磁力拳', '拳', '#2dbf91'), kick: attack('噴射鞋踢', '踢', '#d9ff68') }),
  hero('code-maker', '程式發明家', '#9258ed', 'male', '程式發明家；紫黑科技連帽運動裝；尖翹瀏海短髮輪廓；發光腕帶配件；電光紫點綴色。', { energy: attack('程式光彈', '⌘', '#b38cff'), punch: attack('除錯重拳', '拳', '#8a54dd'), kick: attack('快捷鍵踢', '踢', '#7de5ff') }),
  hero('math-strategist', '數學策略家', '#e3b534', 'female', '數學策略家；金黃幾何運動背心與緊身褲；俐落短髮鋸齒瀏海；計算平板與幾何徽章配件；檸檬黃點綴色。', { energy: attack('幾何方陣', '△', '#ffe56d'), punch: attack('座標重拳', '拳', '#e7b83e'), kick: attack('拋物線踢', '踢', '#ff8d36') }),
  hero('chess-tactician', '棋局軍師', '#6e7f96', 'male', '棋局軍師；灰藍棋盤披肩與校隊長褲；整齊中分蓬髮；戰術眼鏡配件；鋼藍色點綴色。', { energy: attack('棋盤衝擊', '棋', '#dae6f5'), punch: attack('將軍拳', '拳', '#6f87a3'), kick: attack('跳馬踢', '踢', '#b8d8fb') }),
  hero('astronomy-observer', '天文觀測員', '#293a9e', 'female', '天文觀測員；午夜藍星圖斗篷與運動靴；長直側馬尾髮型；迷你望遠鏡配件；星紫色點綴色。', { energy: attack('星圖光彈', '★', '#718dff'), punch: attack('流星拳', '拳', '#a9baff'), kick: attack('行星環踢', '踢', '#d775ff') }),
  hero('puzzle-detective', '解謎偵探', '#b76a36', 'male', '解謎偵探；棕橙偵探運動外套與球鞋；微捲側分短髮；放大鏡與線索腰包配件；琥珀色點綴色。', { energy: attack('線索光彈', '？', '#ffc15d'), punch: attack('推理拳', '拳', '#bd6f3c'), kick: attack('追蹤踢', '踢', '#ffdf7e') }),
  hero('language-magician', '語言魔術師', '#d947b1', 'female', '語言魔術師；玫紫書頁披肩與魔術運動服；波浪長髮高馬尾輪廓；字母卡牌配件；覆盆子紅點綴色。', { energy: attack('字母光波', '字', '#ff8ce3'), punch: attack('書頁拳', '拳', '#df4bc0'), kick: attack('詞語旋踢', '踢', '#ffd1f2') }),
  hero('nature-researcher', '自然研究員', '#4aa84d', 'male', '自然研究員；森林綠植物社背心與登山短褲；自然捲蓬鬆短髮；採集腰包與葉片夾配件；苔蘚綠點綴色。', { energy: attack('葉片光彈', '葉', '#8de064'), punch: attack('藤蔓拳', '拳', '#4aa650'), kick: attack('樹根踢', '踢', '#b4d962') }),
]);

export const CAMPUS_SCENES = Object.freeze([
  Object.freeze({ id: 'daxi-gate', label: '大溪校門對決', image: './assets/battle/scenes/daxi-gate.png', music: './assets/battle/music/school.mp3' }),
  Object.freeze({ id: 'track', label: '紅色跑道衝刺', image: './assets/battle/scenes/track.png', music: './assets/battle/music/school.mp3' }),
  Object.freeze({ id: 'basketball-court', label: '籃球場決勝', image: './assets/battle/scenes/basketball-court.png', music: './assets/battle/music/palace.mp3' }),
  Object.freeze({ id: 'classroom', label: '教室知識擂台', image: './assets/battle/scenes/classroom.png', music: './assets/battle/music/ship.mp3' }),
]);
