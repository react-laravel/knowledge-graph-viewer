/** 默认示例：红楼梦人物关系图（扩展版） */
export const rawGraph = {
  nodes: [
    // 四大家族
    { id: '贾府', label: '贾府', group: 'org' },
    { id: '荣国府', label: '荣国府', group: 'org' },
    { id: '宁国府', label: '宁国府', group: 'org' },
    { id: '薛家', label: '薛家', group: 'org' },
    { id: '林家', label: '林家', group: 'org' },
    { id: '史家', label: '史家', group: 'org' },
    { id: '王家', label: '王家', group: 'org' },

    // 贾府长辈
    { id: '贾母', label: '贾母' },
    { id: '贾敬', label: '贾敬' },
    { id: '贾赦', label: '贾赦' },
    { id: '邢夫人', label: '邢夫人' },
    { id: '贾政', label: '贾政' },
    { id: '王夫人', label: '王夫人' },

    // 王家（四大家族）
    { id: '王子腾', label: '王子腾' },
    { id: '王仁', label: '王仁' },

    // 宁国府
    { id: '贾珍', label: '贾珍' },
    { id: '尤氏', label: '尤氏' },
    { id: '贾蓉', label: '贾蓉' },
    { id: '秦可卿', label: '秦可卿' },
    { id: '焦大', label: '焦大' },

    // 荣国府年轻一代
    { id: '贾元春', label: '贾元春' },
    { id: '贾琏', label: '贾琏' },
    { id: '王熙凤', label: '王熙凤' },
    { id: '贾巧姐', label: '贾巧姐' },
    { id: '贾宝玉', label: '贾宝玉' },
    { id: '贾珠', label: '贾珠' },
    { id: '李纨', label: '李纨' },
    { id: '贾兰', label: '贾兰' },
    { id: '贾环', label: '贾环' },
    { id: '赵姨娘', label: '赵姨娘' },
    { id: '贾迎春', label: '贾迎春' },
    { id: '贾探春', label: '贾探春' },
    { id: '贾惜春', label: '贾惜春' },
    { id: '贾芸', label: '贾芸' },
    { id: '贾芹', label: '贾芹' },
    { id: '贾瑞', label: '贾瑞' },

    // 林家
    { id: '林如海', label: '林如海' },
    { id: '贾敏', label: '贾敏' },
    { id: '林黛玉', label: '林黛玉' },

    // 薛家
    { id: '薛姨妈', label: '薛姨妈' },
    { id: '薛蟠', label: '薛蟠' },
    { id: '薛宝钗', label: '薛宝钗' },
    { id: '香菱', label: '香菱' },
    { id: '薛蝌', label: '薛蝌' },
    { id: '薛宝琴', label: '薛宝琴' },
    { id: '夏金桂', label: '夏金桂' },

    // 史家
    { id: '史湘云', label: '史湘云' },

    // 金陵十二钗相关
    { id: '妙玉', label: '妙玉' },
    { id: '尤二姐', label: '尤二姐' },
    { id: '尤三姐', label: '尤三姐' },
    { id: '尤老娘', label: '尤老娘' },
    { id: '邢岫烟', label: '邢岫烟' },

    // 宝玉身边丫鬟
    { id: '袭人', label: '袭人' },
    { id: '晴雯', label: '晴雯' },
    { id: '麝月', label: '麝月' },
    { id: '秋纹', label: '秋纹' },
    { id: '碧痕', label: '碧痕' },
    { id: '小红', label: '小红' },

    // 各房主仆
    { id: '平儿', label: '平儿' },
    { id: '鸳鸯', label: '鸳鸯' },
    { id: '紫鹃', label: '紫鹃' },
    { id: '莺儿', label: '莺儿' },
    { id: '司棋', label: '司棋' },
    { id: '侍书', label: '侍书' },
    { id: '入画', label: '入画' },
    { id: '雪雁', label: '雪雁' },
    { id: '金钏', label: '金钏' },
    { id: '玉钏', label: '玉钏' },
    { id: '彩云', label: '彩云' },
    { id: '彩霞', label: '彩霞' },
    { id: '绣橘', label: '绣橘' },
    { id: '宝珠', label: '宝珠' },
    { id: '瑞珠', label: '瑞珠' },
    { id: '赖大', label: '赖大' },
    { id: '林之孝', label: '林之孝' },
    { id: '旺儿', label: '旺儿' },
    { id: '周瑞家的', label: '周瑞家的' },
    { id: '来旺家的', label: '来旺家的' },

    // 其他重要人物
    { id: '刘姥姥', label: '刘姥姥' },
    { id: '柳湘莲', label: '柳湘莲' },
    { id: '蒋玉菡', label: '蒋玉菡' },
    { id: '贾雨村', label: '贾雨村' },
    { id: '甄士隐', label: '甄士隐' },
  ],
  edges: [
    // 四大家族归属
    { id: 'e6', source: '王家', target: '王夫人', type: '家族' },
    { id: 'e7', source: '王家', target: '王熙凤', type: '家族' },
    { id: 'e8', source: '王家', target: '薛姨妈', type: '家族' },
    { id: 'e9', source: '王家', target: '王子腾', type: '家族' },
    { id: 'e10', source: '王家', target: '王仁', type: '家族' },
    { id: 'e11', source: '林家', target: '林如海', type: '家族' },
    { id: 'e11b', source: '林家', target: '林黛玉', type: '家族' },
    { id: 'e11c', source: '薛家', target: '薛宝钗', type: '家族' },
    { id: 'e11d', source: '薛家', target: '薛蟠', type: '家族' },
    { id: 'e11e', source: '史家', target: '史湘云', type: '家族' },
    { id: 'e1', source: '贾府', target: '荣国府', type: '下辖' },
    { id: 'e2', source: '贾府', target: '宁国府', type: '下辖' },
    { id: 'e3', source: '薛家', target: '薛姨妈', type: '家族' },
    { id: 'e4', source: '薛家', target: '香菱', type: '家族' },
    { id: 'e5', source: '薛家', target: '薛蝌', type: '家族' },
    { id: 'e5b', source: '薛家', target: '薛宝琴', type: '家族' },

    // 王家内部
    { id: 'e11f', source: '王子腾', target: '王夫人', type: '兄妹' },
    { id: 'e11g', source: '王子腾', target: '薛姨妈', type: '兄妹' },
    { id: 'e11h', source: '王子腾', target: '王熙凤', type: '舅甥' },
    { id: 'e11i', source: '王仁', target: '王熙凤', type: '兄妹' },

    // 贾母一脉（贾母 → 贾赦/贾政/贾敏/贾敬 为子女；元春、宝玉等为孙辈）
    { id: 'e12', source: '贾母', target: '贾赦', type: '母子' },
    { id: 'e12b', source: '贾母', target: '贾政', type: '母子' },
    { id: 'e12c', source: '贾母', target: '贾敬', type: '母子' },
    { id: 'e14', source: '贾母', target: '贾敏', type: '母女' },
    { id: 'e15', source: '贾母', target: '贾宝玉', type: '祖孙' },
    { id: 'e15b', source: '贾母', target: '贾琏', type: '祖孙' },
    { id: 'e15c', source: '贾母', target: '贾兰', type: '祖孙' },
    { id: 'e16', source: '贾母', target: '林黛玉', type: '外祖孙' },
    { id: 'e17', source: '贾母', target: '史湘云', type: '姑祖孙' },
    { id: 'e18', source: '贾母', target: '王熙凤', type: '孙媳' },
    { id: 'e19b', source: '荣国府', target: '贾元春', type: '家族' },
    { id: 'e19c', source: '贾母', target: '贾元春', type: '祖孙' },
    { id: 'e19d', source: '贾元春', target: '贾宝玉', type: '姐弟' },
    { id: 'e19e', source: '贾母', target: '鸳鸯', type: '主仆' },
    { id: 'e19f', source: '王熙凤', target: '鸳鸯', type: '侍奉' },
    { id: 'e19g', source: '贾政', target: '贾元春', type: '父女' },
    { id: 'e19h', source: '王夫人', target: '贾元春', type: '母女' },
    { id: 'e19i', source: '贾政', target: '赵姨娘', type: '妾' },

    // 宁府家庭
    { id: 'e19', source: '贾敬', target: '贾珍', type: '父子' },
    { id: 'e20', source: '贾珍', target: '尤氏', type: '夫妻' },
    { id: 'e21', source: '贾珍', target: '贾蓉', type: '父子' },
    { id: 'e22', source: '贾蓉', target: '秦可卿', type: '夫妻' },
    { id: 'e22b', source: '焦大', target: '宁国府', type: '老奴' },
    { id: 'e22c', source: '秦可卿', target: '宝珠', type: '丫鬟' },
    { id: 'e22d', source: '秦可卿', target: '瑞珠', type: '丫鬟' },
    { id: 'e22e', source: '尤老娘', target: '尤二姐', type: '母女' },
    { id: 'e22f', source: '尤老娘', target: '尤三姐', type: '母女' },
    { id: 'e22g', source: '尤氏', target: '尤二姐', type: '异母姐妹' },
    { id: 'e22h', source: '尤氏', target: '尤三姐', type: '异母姐妹' },

    // 赦房
    { id: 'e24', source: '贾赦', target: '邢夫人', type: '夫妻' },
    { id: 'e25', source: '贾赦', target: '贾迎春', type: '父女' },
    { id: 'e26', source: '贾赦', target: '贾琏', type: '父子' },

    // 政房
    { id: 'e27', source: '贾政', target: '王夫人', type: '夫妻' },
    { id: 'e28', source: '贾政', target: '贾宝玉', type: '父子' },
    { id: 'e29', source: '贾政', target: '贾珠', type: '父子' },
    { id: 'e30', source: '贾政', target: '贾探春', type: '父女' },
    { id: 'e31', source: '贾政', target: '贾环', type: '父子' },
    { id: 'e32', source: '王夫人', target: '贾宝玉', type: '母子' },
    { id: 'e33', source: '王夫人', target: '贾珠', type: '母子' },
    { id: 'e34', source: '王夫人', target: '贾探春', type: '嫡母' },
    { id: 'e35', source: '赵姨娘', target: '贾环', type: '母子' },
    { id: 'e36', source: '赵姨娘', target: '贾探春', type: '母女' },
    { id: 'e37', source: '贾珠', target: '李纨', type: '夫妻' },
    { id: 'e38', source: '李纨', target: '贾兰', type: '母子' },

    // 琏凤房
    { id: 'e39', source: '贾琏', target: '王熙凤', type: '夫妻' },
    { id: 'e40', source: '王熙凤', target: '贾巧姐', type: '母女' },
    { id: 'e41', source: '贾琏', target: '贾巧姐', type: '父女' },
    { id: 'e42', source: '王熙凤', target: '平儿', type: '主仆' },
    { id: 'e43', source: '贾琏', target: '平儿', type: '妾' },
    { id: 'e44', source: '王熙凤', target: '尤二姐', type: '迫害' },
    { id: 'e45', source: '贾琏', target: '尤二姐', type: '偷娶' },
    { id: 'e45b', source: '贾琏', target: '贾芸', type: '族叔侄' },
    { id: 'e45c', source: '王熙凤', target: '贾芸', type: '提携' },
    { id: 'e45d', source: '王熙凤', target: '旺儿', type: '主仆' },
    { id: 'e45e', source: '王熙凤', target: '来旺家的', type: '主仆' },
    { id: 'e45f', source: '王熙凤', target: '贾瑞', type: '戏弄' },
    { id: 'e45g', source: '贾珍', target: '贾芹', type: '族叔侄' },
    { id: 'e45h', source: '贾赦', target: '邢岫烟', type: '姑侄' },
    { id: 'e45i', source: '邢夫人', target: '邢岫烟', type: '姑侄' },

    // 林家
    { id: 'e46', source: '林如海', target: '贾敏', type: '夫妻' },
    { id: 'e47', source: '林如海', target: '林黛玉', type: '父女' },
    { id: 'e48', source: '贾敏', target: '林黛玉', type: '母女' },

    // 薛家
    { id: 'e50', source: '薛姨妈', target: '薛宝钗', type: '母女' },
    { id: 'e51', source: '薛姨妈', target: '薛蟠', type: '母子' },
    { id: 'e52', source: '薛姨妈', target: '王夫人', type: '姐妹' },
    { id: 'e53', source: '薛蟠', target: '香菱', type: '妾' },
    { id: 'e54', source: '薛蟠', target: '薛宝钗', type: '兄妹' },
    { id: 'e55', source: '甄士隐', target: '香菱', type: '父女' },
    { id: 'e55b', source: '薛蟠', target: '夏金桂', type: '夫妻' },
    { id: 'e55c', source: '薛蝌', target: '邢岫烟', type: '未婚夫妻' },
    { id: 'e55d', source: '薛宝钗', target: '薛宝琴', type: '堂姐妹' },
    { id: 'e55e', source: '薛蟠', target: '薛蝌', type: '堂兄弟' },
    { id: 'e55f', source: '夏金桂', target: '香菱', type: '迫害' },

    // 宝玉情感主线
    { id: 'e56', source: '贾宝玉', target: '林黛玉', type: '木石前盟' },
    { id: 'e57', source: '贾宝玉', target: '薛宝钗', type: '金玉良缘' },
    { id: 'e58', source: '贾宝玉', target: '史湘云', type: '兄妹情' },
    { id: 'e59', source: '贾宝玉', target: '秦可卿', type: '仰慕' },
    { id: 'e60', source: '贾宝玉', target: '妙玉', type: '知己' },

    // 其他感情线
    { id: 'e61', source: '尤三姐', target: '柳湘莲', type: '殉情' },
    { id: 'e62', source: '蒋玉菡', target: '袭人', type: '归宿' },

    // 宝玉丫鬟
    { id: 'e64', source: '贾宝玉', target: '袭人', type: '贴身丫鬟' },
    { id: 'e65', source: '贾宝玉', target: '晴雯', type: '丫鬟' },
    { id: 'e66', source: '贾宝玉', target: '麝月', type: '丫鬟' },
    { id: 'e67', source: '贾宝玉', target: '秋纹', type: '丫鬟' },
    { id: 'e68', source: '贾宝玉', target: '碧痕', type: '丫鬟' },
    { id: 'e69', source: '贾宝玉', target: '小红', type: '丫鬟' },

    // 各房丫鬟
    { id: 'e70', source: '林黛玉', target: '紫鹃', type: '丫鬟' },
    { id: 'e71', source: '林黛玉', target: '雪雁', type: '丫鬟' },
    { id: 'e72', source: '薛宝钗', target: '莺儿', type: '丫鬟' },
    { id: 'e73', source: '贾探春', target: '侍书', type: '丫鬟' },
    { id: 'e74', source: '贾探春', target: '司棋', type: '丫鬟' },
    { id: 'e75', source: '贾惜春', target: '入画', type: '丫鬟' },
    { id: 'e75b', source: '王夫人', target: '金钏', type: '丫鬟' },
    { id: 'e75c', source: '王夫人', target: '玉钏', type: '丫鬟' },
    { id: 'e75d', source: '金钏', target: '玉钏', type: '姐妹' },
    { id: 'e75e', source: '赵姨娘', target: '彩云', type: '丫鬟' },
    { id: 'e75f', source: '赵姨娘', target: '彩霞', type: '丫鬟' },
    { id: 'e75g', source: '贾迎春', target: '绣橘', type: '丫鬟' },
    { id: 'e75h', source: '王夫人', target: '周瑞家的', type: '陪房' },
    { id: 'e75i', source: '贾母', target: '赖大', type: '总管家' },
    { id: 'e75j', source: '荣国府', target: '林之孝', type: '管家' },

    // 大观园姐妹
    { id: 'e76', source: '贾宝玉', target: '贾探春', type: '兄妹' },
    { id: 'e77', source: '贾宝玉', target: '贾迎春', type: '兄妹' },
    { id: 'e78', source: '贾宝玉', target: '贾惜春', type: '兄妹' },
    { id: 'e79', source: '林黛玉', target: '薛宝钗', type: '竞逐' },
    { id: 'e80', source: '林黛玉', target: '史湘云', type: '姐妹' },
    { id: 'e81', source: '薛宝钗', target: '史湘云', type: '姐妹' },

    // 管理与人际
    { id: 'e84', source: '刘姥姥', target: '贾母', type: '拜访' },
    { id: 'e85', source: '刘姥姥', target: '王熙凤', type: '求助' },
    { id: 'e86', source: '贾雨村', target: '甄士隐', type: '恩人' },
    { id: 'e87', source: '贾雨村', target: '林黛玉', type: '师生' },

    // 四春亲属
    { id: 'e89', source: '贾迎春', target: '邢夫人', type: '嫡母' },
    { id: 'e90', source: '贾惜春', target: '贾珍', type: '兄妹' },
    { id: 'e91', source: '贾赦', target: '贾探春', type: '伯侄' },
    { id: 'e92', source: '贾探春', target: '贾迎春', type: '姐妹' },
    { id: 'e93', source: '贾探春', target: '贾惜春', type: '姐妹' },
    { id: 'e94', source: '贾迎春', target: '贾惜春', type: '姐妹' },
    { id: 'e95', source: '史湘云', target: '贾探春', type: '姐妹' },
    { id: 'e97', source: '邢岫烟', target: '贾迎春', type: '表姐妹' },
    { id: 'e98', source: '薛宝琴', target: '史湘云', type: '姐妹' },
    { id: 'e99', source: '妙玉', target: '贾母', type: '寄居' },
  ],
}
