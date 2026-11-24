/** Parses the holiday date formats the backend returns (YYYY-MM-DD, DD-MM-YYYY, "15 Aug 2026", "Aug 15, 2026") into a local date. */
export function parseHolidayDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  
  // 1. ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // 2. Format: DD-MM-YYYY or DD/MM/YYYY
  if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split(/[-/]/).map(Number);
    return new Date(y, m - 1, d);
  }

  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  // 3. Format: "15 Aug 2026" or "15 August 2026"
  const dayMonthYearMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
  if (dayMonthYearMatch) {
    const d = parseInt(dayMonthYearMatch[1], 10);
    const monthStr = dayMonthYearMatch[2].substring(0, 3).toLowerCase();
    const y = parseInt(dayMonthYearMatch[3], 10);
    if (monthMap[monthStr] !== undefined) {
      return new Date(y, monthMap[monthStr], d);
    }
  }

  // 4. Format: "Aug 15, 2026" or "August 15 2026"
  const monthDayYearMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthDayYearMatch) {
    const monthStr = monthDayYearMatch[1].substring(0, 3).toLowerCase();
    const d = parseInt(monthDayYearMatch[2], 10);
    const y = parseInt(monthDayYearMatch[3], 10);
    if (monthMap[monthStr] !== undefined) {
      return new Date(y, monthMap[monthStr], d);
    }
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return null;
}
