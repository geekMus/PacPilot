export const commonTimeZones = [
  { value: "Asia/Shanghai", labelKey: "settings.tzShanghai" },
  { value: "Asia/Taipei", labelKey: "settings.tzTaipei" },
  { value: "Asia/Hong_Kong", labelKey: "settings.tzHongKong" },
  { value: "Asia/Tokyo", labelKey: "settings.tzTokyo" },
  { value: "Asia/Seoul", labelKey: "settings.tzSeoul" },
  { value: "Asia/Singapore", labelKey: "settings.tzSingapore" },
  { value: "Asia/Bangkok", labelKey: "settings.tzBangkok" },
  { value: "Asia/Kolkata", labelKey: "settings.tzKolkata" },
  { value: "Asia/Dubai", labelKey: "settings.tzDubai" },
  { value: "Europe/London", labelKey: "settings.tzLondon" },
  { value: "Europe/Paris", labelKey: "settings.tzParis" },
  { value: "Europe/Berlin", labelKey: "settings.tzBerlin" },
  { value: "America/New_York", labelKey: "settings.tzNewYork" },
  { value: "America/Chicago", labelKey: "settings.tzChicago" },
  { value: "America/Denver", labelKey: "settings.tzDenver" },
  { value: "America/Los_Angeles", labelKey: "settings.tzLosAngeles" },
  { value: "America/Toronto", labelKey: "settings.tzToronto" },
  { value: "Australia/Sydney", labelKey: "settings.tzSydney" },
  { value: "Pacific/Auckland", labelKey: "settings.tzAuckland" },
  { value: "Etc/UTC", labelKey: "settings.tzUTC" },
] as const;

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
