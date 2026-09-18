export interface CountryInfo {
  name: string;
  code: string;
  emoji: string;
}

const COUNTRY_PATTERNS: { pattern: RegExp; info: CountryInfo }[] = [
  // 1. 特殊提示类（流量、到期时间、公告等提示节点，不归属于具体国家）
  {
    pattern: /剩余流量|到期|重置|剩余|官网|通知|公告|更新|维护|Expire|Reset|Traffic|Notice|Website/i,
    info: { name: '提示', code: 'INFO', emoji: 'ℹ️' },
  },

  // 2. 香港 Hong Kong
  {
    pattern: /香港|Hong\s*Kong|HongKong|HKG|HKT|HKBN|\bHK\b|🇭🇰/i,
    info: { name: '香港', code: 'HK', emoji: '🇭🇰' },
  },

  // 3. 日本 Japan
  {
    pattern: /日本|Japan|Tokyo|Osaka|东京|大阪|川崎|名古屋|福冈|\bJP\b|\bJPN\b|🇯🇵/i,
    info: { name: '日本', code: 'JP', emoji: '🇯🇵' },
  },

  // 4. 美国 United States (包含常见州/城市名：California, Los Angeles, San Jose, Silicon Valley, New York, Frankfurt 等)
  {
    pattern: /美国|United\s*States|America|California|加州|洛杉矶|硅谷|西雅图|纽约|芝加哥|圣何塞|波特兰|弗吉尼亚|凤凰城|达拉斯|迈阿密|\bUSA\b|\bUS\b|🇺🇸/i,
    info: { name: '美国', code: 'US', emoji: '🇺🇸' },
  },

  // 5. 德国 Germany (包含 Frankfurt 等常见节点命名)
  {
    pattern: /德国|Germany|Frankfurt|法兰克福|柏林|慕尼黑|\bDE\b|\bGER\b|🇩🇪/i,
    info: { name: '德国', code: 'DE', emoji: '🇩🇪' },
  },

  // 6. 新加坡 Singapore
  {
    pattern: /新加坡|Singapore|狮城|\bSG\b|\bSGP\b|🇸🇬/i,
    info: { name: '新加坡', code: 'SG', emoji: '🇸🇬' },
  },

  // 7. 台湾 Taiwan
  {
    pattern: /台湾|Taiwan|台北|台中|高雄|新北|\bTW\b|\bTWN\b|🇹🇼/i,
    info: { name: '台湾', code: 'TW', emoji: '🇹🇼' },
  },

  // 8. 韩国 Korea
  {
    pattern: /韩国|Korea|首尔|釜山|春川|\bKR\b|\bKOR\b|🇰🇷/i,
    info: { name: '韩国', code: 'KR', emoji: '🇰🇷' },
  },

  // 9. 英国 United Kingdom (严格避免被 GB 粗匹配误伤中文拼音)
  {
    pattern: /英国|Great\s*Britain|United\s*Kingdom|London|伦敦|曼彻斯特|\bUK\b|\bGBR\b|🇬🇧/i,
    info: { name: '英国', code: 'GB', emoji: '🇬🇧' },
  },

  // 10. 法国 France
  {
    pattern: /法国|France|Paris|巴黎|马赛|\bFR\b|\bFRA\b|🇫🇷/i,
    info: { name: '法国', code: 'FR', emoji: '🇫🇷' },
  },

  // 11. 加拿大 Canada
  {
    pattern: /加拿大|Canada|多伦多|温哥华|蒙特利尔|\bCA\b|\bCAN\b|🇨🇦/i,
    info: { name: '加拿大', code: 'CA', emoji: '🇨🇦' },
  },

  // 12. 澳大利亚 Australia
  {
    pattern: /澳大利亚|澳洲|Australia|Sydney|Melbourne|悉尼|墨尔本|布里斯班|\bAU\b|\bAUS\b|🇦🇺/i,
    info: { name: '澳大利亚', code: 'AU', emoji: '🇦🇺' },
  },

  // 13. 俄罗斯 Russia
  {
    pattern: /俄罗斯|Russia|Moscow|莫斯科|圣彼得堡|海参崴|\bRU\b|\bRUS\b|🇷🇺/i,
    info: { name: '俄罗斯', code: 'RU', emoji: '🇷🇺' },
  },

  // 14. 印度 India
  {
    pattern: /印度|India|Mumbai|孟买|德里|班加罗尔|\bIN\b|\bIND\b|🇮🇳/i,
    info: { name: '印度', code: 'IN', emoji: '🇮🇳' },
  },

  // 15. 马来西亚 Malaysia
  {
    pattern: /马来西亚|大马|Malaysia|吉隆坡|\bMY\b|\bMYS\b|🇲🇾/i,
    info: { name: '马来西亚', code: 'MY', emoji: '🇲🇾' },
  },

  // 16. 泰国 Thailand
  {
    pattern: /泰国|Thailand|Bangkok|曼谷|\bTH\b|\bTHA\b|🇹🇭/i,
    info: { name: '泰国', code: 'TH', emoji: '🇹🇭' },
  },

  // 17. 土耳其 Turkey
  {
    pattern: /土耳其|Turkey|Istanbul|伊斯坦布尔|\bTR\b|\bTUR\b|🇹🇷/i,
    info: { name: '土耳其', code: 'TR', emoji: '🇹🇷' },
  },

  // 18. 阿根廷 Argentina
  {
    pattern: /阿根廷|Argentina|布宜诺斯艾利斯|\bAR\b|\bARG\b|🇦🇷/i,
    info: { name: '阿根廷', code: 'AR', emoji: '🇦🇷' },
  },

  // 19. 巴西 Brazil
  {
    pattern: /巴西|Brazil|圣保罗|里约热内卢|\bBR\b|\bBRA\b|🇧🇷/i,
    info: { name: '巴西', code: 'BR', emoji: '🇧🇷' },
  },

  // 20. 荷兰 Netherlands
  {
    pattern: /荷兰|Netherlands|Amsterdam|阿姆斯特丹|\bNL\b|\bNLD\b|🇳🇱/i,
    info: { name: '荷兰', code: 'NL', emoji: '🇳🇱' },
  },

  // 21. 菲律宾 Philippines
  {
    pattern: /菲律宾|Philippines|Manila|马尼拉|\bPH\b|\bPHL\b|🇵🇭/i,
    info: { name: '菲律宾', code: 'PH', emoji: '🇵🇭' },
  },

  // 22. 越南 Vietnam
  {
    pattern: /越南|Vietnam|胡志明|河内|\bVN\b|\bVNM\b|🇻🇳/i,
    info: { name: '越南', code: 'VN', emoji: '🇻🇳' },
  },

  // 23. 瑞士 Switzerland
  {
    pattern: /瑞士|Switzerland|苏黎世|日内瓦|\bCH\b|\bCHE\b|🇨🇭/i,
    info: { name: '瑞士', code: 'CH', emoji: '🇨🇭' },
  },

  // 24. 瑞典 Sweden
  {
    pattern: /瑞典|Sweden|斯德哥尔摩|\bSE\b|\bSWE\b|🇸🇪/i,
    info: { name: '瑞典', code: 'SE', emoji: '🇸🇪' },
  },

  // 25. 爱尔兰 Ireland
  {
    pattern: /爱尔兰|Ireland|都柏林|\bIE\b|\bIRL\b|🇮🇪/i,
    info: { name: '爱尔兰', code: 'IE', emoji: '🇮🇪' },
  },

  // 26. 阿联酋 UAE
  {
    pattern: /阿联酋|迪拜|阿布扎比|Dubai|\bUAE\b|\bAE\b|🇦🇪/i,
    info: { name: '阿联酋', code: 'AE', emoji: '🇦🇪' },
  },

  // 27. 中国 China
  {
    pattern: /中国|China|回国|上海|北京|广州|深圳|杭州|南京|武汉|成都|重庆|🇨🇳|\bCN\b/i,
    info: { name: '中国', code: 'CN', emoji: '🇨🇳' },
  },
];

export function detectCountry(nodeName: string): CountryInfo {
  if (!nodeName || typeof nodeName !== 'string') {
    return { name: '其他', code: 'OTHER', emoji: '🌐' };
  }
  for (const { pattern, info } of COUNTRY_PATTERNS) {
    if (pattern.test(nodeName)) {
      return info;
    }
  }
  return { name: '其他', code: 'OTHER', emoji: '🌐' };
}
