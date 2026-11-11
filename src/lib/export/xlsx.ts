import { utf8, zip, type ZipEntry } from './zip';

/**
 * A real .xlsx workbook written by hand: Office Open XML inside a ZIP. Values keep their
 * type, so a number stays a number in Excel and Google Sheets instead of arriving as text,
 * and nothing in a cell can be read back as a formula.
 */

export type Format = 'text' | 'int' | 'decimal' | 'percent' | 'date';

export interface Column {
  header: string;
  /** Width in characters; a sensible default is derived from the header when missing. */
  width?: number;
  format?: Format;
}

export interface Sheet {
  name: string;
  title?: string;
  subtitle?: string;
  columns: Column[];
  rows: (string | number | null)[][];
  /** Printed under the table: what the numbers mean and where they came from. */
  notes?: string[];
}

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const esc = (value: string) =>
  // eslint-disable-next-line no-control-regex
  value.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** 0 → A, 26 → AA. */
function columnLetter(index: number): string {
  let letter = '';
  let rest = index;
  do {
    letter = String.fromCharCode(65 + (rest % 26)) + letter;
    rest = Math.floor(rest / 26) - 1;
  } while (rest >= 0);
  return letter;
}

const STYLE = { body: 0, header: 1, title: 2, subtitle: 3, int: 4, decimal: 5, percent: 6, date: 7 } as const;
const FORMAT_STYLE: Record<Format, number> = {
  text: STYLE.body,
  int: STYLE.int,
  decimal: STYLE.decimal,
  percent: STYLE.percent,
  date: STYLE.date,
};

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0.0"/><numFmt numFmtId="166" formatCode="0.0&quot;%&quot;"/><numFmt numFmtId="167" formatCode="yyyy\\-mm\\-dd\\ hh:mm"/></numFmts>
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF0A1B3D"/><name val="Calibri"/></font>
<font><b/><sz val="15"/><color rgb="FF0A1B3D"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font>
</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEFF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFBFCBE8"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellXml(reference: string, value: string | number | null, style: number): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  }
  return `<c r="${reference}" s="${style === STYLE.body ? STYLE.body : style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const lines: string[] = [];
  let rowNumber = 0;
  const row = (cells: string[]) => {
    rowNumber++;
    lines.push(`<row r="${rowNumber}">${cells.join('')}</row>`);
  };
  if (sheet.title) row([cellXml(`A${rowNumber + 1}`, sheet.title, STYLE.title)]);
  if (sheet.subtitle) row([cellXml(`A${rowNumber + 1}`, sheet.subtitle, STYLE.subtitle)]);
  if (sheet.title || sheet.subtitle) row([]);
  const headerRow = rowNumber + 1;
  row(sheet.columns.map((column, index) => cellXml(`${columnLetter(index)}${headerRow}`, column.header, STYLE.header)));
  for (const values of sheet.rows) {
    const reference = rowNumber + 1;
    row(
      sheet.columns.map((column, index) => {
        const value = values[index] ?? null;
        const style = typeof value === 'number' ? FORMAT_STYLE[column.format ?? 'int'] : STYLE.body;
        return cellXml(`${columnLetter(index)}${reference}`, value, style);
      }),
    );
  }
  if (sheet.notes?.length) {
    row([]);
    for (const note of sheet.notes) row([cellXml(`A${rowNumber + 1}`, note, STYLE.subtitle)]);
  }

  const cols = sheet.columns
    .map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width ?? Math.min(46, Math.max(12, column.header.length + 4))}" customWidth="1"/>`)
    .join('');
  const freeze = `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>`;
  const dimension = `A1:${columnLetter(Math.max(0, sheet.columns.length - 1))}${Math.max(1, rowNumber)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/><sheetViews><sheetView rightToLeft="1" workbookViewId="0">${freeze}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${lines.join('')}</sheetData><autoFilter ref="${columnLetter(0)}${headerRow}:${columnLetter(Math.max(0, sheet.columns.length - 1))}${Math.max(headerRow, rowNumber)}"/></worksheet>`;
}

/** Sheet names cannot hold : \ / ? * [ ] and stop at 31 characters. */
const sheetName = (name: string, index: number) => (name.replace(/[:\\/?*[\]]/g, ' ').trim() || `Sheet${index + 1}`).slice(0, 31);

export function workbook(sheets: Sheet[]): Blob {
  const named = sheets.map((sheet, index) => ({ ...sheet, name: sheetName(sheet.name, index) }));
  const entries: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${named
        .map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    },
    {
      name: '_rels/.rels',
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    },
    {
      name: 'xl/workbook.xml',
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named
        .map((sheet, index) => `<sheet name="${esc(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
        .join('')}</sheets></workbook>`),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named
        .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
        .join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    },
    { name: 'xl/styles.xml', data: utf8(STYLES_XML) },
    ...named.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: utf8(sheetXml(sheet)) })),
  ];
  const blob = zip(entries);
  return blob.slice(0, blob.size, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
