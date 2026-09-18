import React from 'react';

interface CountryBadgeProps {
  country?: string;
  code?: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
  HK: '🇭🇰',
  JP: '🇯🇵',
  US: '🇺🇸',
  SG: '🇸🇬',
  TW: '🇹🇼',
  KR: '🇰🇷',
  GB: '🇬🇧',
  DE: '🇩🇪',
  FR: '🇫🇷',
  CA: '🇨🇦',
  AU: '🇦🇺',
  RU: '🇷🇺',
  IN: '🇮🇳',
  MY: '🇲🇾',
  TH: '🇹🇭',
  TR: '🇹🇷',
  AR: '🇦🇷',
  BR: '🇧🇷',
  NL: '🇳🇱',
  PH: '🇵🇭',
  VN: '🇻🇳',
  CN: '🇨🇳',
  OTHER: '🌐',
};

export const CountryBadge: React.FC<CountryBadgeProps> = ({ country = '其他', code = 'OTHER' }) => {
  const flag = COUNTRY_FLAGS[code?.toUpperCase()] || '🌐';

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-slate-800/80 text-slate-200 border border-slate-700/60">
      <span className="text-sm">{flag}</span>
      <span>{country}</span>
    </span>
  );
};
