export interface CountryInfo {
  name: string;
  code: string;
  emoji: string;
}

const COUNTRY_PATTERNS: { pattern: RegExp; info: CountryInfo }[] = [
  // 1. Chinese names & specific long terms first
  { pattern: /香港|Hong\s*Kong|HongKong|HKG|🇭🇰|\bHK\b/i, info: { name: '香港', code: 'HK', emoji: '🇭🇰' } },
  { pattern: /日本|Japan|Tokyo|Osaka|东京|大阪|🇯🇵|\bJP\b/i, info: { name: '日本', code: 'JP', emoji: '🇯🇵' } },
  { pattern: /美国|United\s*States|America|洛杉矶|硅谷|西雅图|纽约|芝加哥|🇺🇸|\bUSA\b|\bUS\b/i, info: { name: '美国', code: 'US', emoji: '🇺🇸' } },
  { pattern: /新加坡|Singapore|狮城|🇸🇬|\bSG\b/i, info: { name: '新加坡', code: 'SG', emoji: '🇸🇬' } },
  { pattern: /台湾|Taiwan|台北|台中|🇹🇼|\bTW\b/i, info: { name: '台湾', code: 'TW', emoji: '🇹🇼' } },
  { pattern: /韩国|Korea|首尔|🇰🇷|\bKR\b/i, info: { name: '韩国', code: 'KR', emoji: '🇰🇷' } },
  { pattern: /英国|Great\s*Britain|United\s*Kingdom|伦敦|🇬🇧|\bUK\b|\bGB\b/i, info: { name: '英国', code: 'GB', emoji: '🇬🇧' } },
  { pattern: /德国|Germany|法兰克福|🇩🇪|\bDE\b/i, info: { name: '德国', code: 'DE', emoji: '🇩🇪' } },
  { pattern: /法国|France|巴黎|🇫🇷|\bFR\b/i, info: { name: '法国', code: 'FR', emoji: '🇫🇷' } },
  { pattern: /加拿大|Canada|多伦多|温哥华|🇨🇦|\bCA\b/i, info: { name: '加拿大', code: 'CA', emoji: '🇨🇦' } },
  { pattern: /澳大利亚|澳洲|Australia|悉尼|墨尔本|🇦🇺|\bAU\b/i, info: { name: '澳大利亚', code: 'AU', emoji: '🇦🇺' } },
  { pattern: /俄罗斯|Russia|莫斯科|🇷🇺|\bRU\b/i, info: { name: '俄罗斯', code: 'RU', emoji: '🇷🇺' } },
  { pattern: /印度|India|孟买|🇮🇳|\bIN\b/i, info: { name: '印度', code: 'IN', emoji: '🇮🇳' } },
  { pattern: /马来西亚|Malaysia|吉隆坡|🇲🇾|\bMY\b/i, info: { name: '马来西亚', code: 'MY', emoji: '🇲🇾' } },
  { pattern: /泰国|Thailand|曼谷|🇹🇭|\bTH\b/i, info: { name: '泰国', code: 'TH', emoji: '🇹🇭' } },
  { pattern: /土耳其|Turkey|伊斯坦布尔|🇹🇷|\bTR\b/i, info: { name: '土耳其', code: 'TR', emoji: '🇹🇷' } },
  { pattern: /阿根廷|Argentina|🇦🇷|\bAR\b/i, info: { name: '阿根廷', code: 'AR', emoji: '🇦🇷' } },
  { pattern: /巴西|Brazil|🇧🇷|\bBR\b/i, info: { name: '巴西', code: 'BR', emoji: '🇧🇷' } },
  { pattern: /荷兰|Netherlands|阿姆斯特丹|🇳🇱|\bNL\b/i, info: { name: '荷兰', code: 'NL', emoji: '🇳🇱' } },
  { pattern: /菲律宾|Philippines|🇵🇭|\bPH\b/i, info: { name: '菲律宾', code: 'PH', emoji: '🇵🇭' } },
  { pattern: /越南|Vietnam|🇻🇳|\bVN\b/i, info: { name: '越南', code: 'VN', emoji: '🇻🇳' } },
  { pattern: /中国|China|回国|上海|北京|广州|深圳|🇨🇳|\bCN\b/i, info: { name: '中国', code: 'CN', emoji: '🇨🇳' } },
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
