import i18n from '../i18n';

export interface ReportExportOptions {
  title: string;
  data: any[];
  columns: { key: string; labelKey: string }[];
  language?: string;
}

export class ExportUtils {
  /**
   * Generates a CSV string with localized headers
   */
  static generateLocalizedCSV({ title, data, columns }: ReportExportOptions): string {
    const currentLang = i18n.language;
    
    // Header row using i18n translations
    const headerRow = columns
      .map((col) => `"${i18n.t(col.labelKey, { defaultValue: col.key })}"`)
      .join(',');

    // Data rows
    const dataRows = data.map((row) =>
      columns
        .map((col) => {
          const val = row[col.key] !== undefined ? row[col.key] : '';
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',')
    );

    return [`# ${title} (${currentLang})`, headerRow, ...dataRows].join('\n');
  }

  /**
   * Helper to format PDF export payload
   */
  static prepareLocalizedPDFPayload({ title, data, columns }: ReportExportOptions) {
    return {
      title,
      language: i18n.language,
      headers: columns.map((col) => i18n.t(col.labelKey, { defaultValue: col.key })),
      rows: data.map((row) => columns.map((col) => row[col.key])),
    };
  }
}

export default ExportUtils;
