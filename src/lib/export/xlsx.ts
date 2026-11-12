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
  /** Height of every data row in points; taller rows leave room for a picture. */
  rowHeight?: number;
  /** Pictures placed inside data cells. They move and hide with their row when the sheet is sorted or filtered. */
  images?: SheetImage[];
}

export interface SheetImage {
  /** Index into `rows`. */
  row: number;
  column: number;
  /** JPEG bytes and their natural size in pixels; the picture is scaled down to fit its cell. */
  data: Uint8Array;
  width: number;
  height: number;
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

const columnWidth = (column: Column) => column.width ?? Math.min(46, Math.max(12, column.header.length + 4));

/** Rows above the first data row: the title block and the header. */
const leadingRows = (sheet: Sheet) => (sheet.title ? 1 : 0) + (sheet.subtitle ? 1 : 0) + (sheet.title || sheet.subtitle ? 1 : 0) + 1;

const EMU_PER_PX = 9525;
const PAD_PX = 4;

/** A drawing that holds each picture inside its own cell, scaled to fit with a small margin. */
function drawingXml(sheet: Sheet): string {
  const first = leadingRows(sheet);
  const rowPx = Math.round(((sheet.rowHeight ?? 15) * 96) / 72);
  const anchors = (sheet.images ?? []).map((image, index) => {
    const column = sheet.columns[image.column];
    const cellPx = Math.trunc(columnWidth(column) * 7 + 5);
    const scale = Math.min((cellPx - PAD_PX * 2) / image.width, (rowPx - PAD_PX * 2) / image.height, 1);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const left = Math.round((cellPx - width) / 2);
    const top = Math.round((rowPx - height) / 2);
    const row = first + image.row;
    const at = (col: number, colPx: number, rowAt: number, rowPx: number) =>
      `<xdr:col>${col}</xdr:col><xdr:colOff>${colPx * EMU_PER_PX}</xdr:colOff><xdr:row>${rowAt}</xdr:row><xdr:rowOff>${rowPx * EMU_PER_PX}</xdr:rowOff>`;
    return `<xdr:twoCellAnchor><xdr:from>${at(image.column, left, row, top)}</xdr:from><xdr:to>${at(image.column, left + width, row, top + height)}</xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${index + 2}" name="Picture ${index + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${index + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width * EMU_PER_PX}" cy="${height * EMU_PER_PX}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join('')}</xdr:wsDr>`;
}

const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function sheetXml(sheet: Sheet): string {
  const lines: string[] = [];
  let rowNumber = 0;
  const row = (cells: string[], height?: number) => {
    rowNumber++;
    lines.push(`<row r="${rowNumber}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells.join('')}</row>`);
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
      sheet.rowHeight,
    );
  }
  if (sheet.notes?.length) {
    row([]);
    for (const note of sheet.notes) row([cellXml(`A${rowNumber + 1}`, note, STYLE.subtitle)]);
  }

  const cols = sheet.columns
    .map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${columnWidth(column)}" customWidth="1"/>`)
    .join('');
  const freeze = `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>`;
  const dimension = `A1:${columnLetter(Math.max(0, sheet.columns.length - 1))}${Math.max(1, rowNumber)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL_TYPE}"><dimension ref="${dimension}"/><sheetViews><sheetView rightToLeft="1" workbookViewId="0">${freeze}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${lines.join('')}</sheetData><autoFilter ref="${columnLetter(0)}${headerRow}:${columnLetter(Math.max(0, sheet.columns.length - 1))}${Math.max(headerRow, rowNumber)}"/>${sheet.images?.length ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
}

/** Sheet names cannot hold : \ / ? * [ ] and stop at 31 characters. */
const sheetName = (name: string, index: number) => (name.replace(/[:\\/?*[\]]/g, ' ').trim() || `Sheet${index + 1}`).slice(0, 31);

export function workbook(sheets: Sheet[]): Blob {
  const named = sheets.map((sheet, index) => ({ ...sheet, name: sheetName(sheet.name, index) }));
  // One drawing per sheet that has pictures; media files are numbered across the whole workbook.
  const drawings: ZipEntry[] = [];
  const drawingOverrides: string[] = [];
  let mediaCount = 0;
  let drawingCount = 0;
  named.forEach((sheet, index) => {
    if (!sheet.images?.length) return;
    const drawing = ++drawingCount;
    drawingOverrides.push(`<Override PartName="/xl/drawings/drawing${drawing}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    const media = sheet.images.map((image) => ({ name: `image${++mediaCount}.jpeg`, data: image.data }));
    drawings.push(
      { name: `xl/worksheets/_rels/sheet${index + 1}.xml.rels`, data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${REL_TYPE}/drawing" Target="../drawings/drawing${drawing}.xml"/></Relationships>`) },
      { name: `xl/drawings/drawing${drawing}.xml`, data: utf8(drawingXml(sheet)) },
      {
        name: `xl/drawings/_rels/drawing${drawing}.xml.rels`,
        data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${RELS_NS}">${media.map((file, at) => `<Relationship Id="rId${at + 1}" Type="${REL_TYPE}/image" Target="../media/${file.name}"/>`).join('')}</Relationships>`),
      },
      ...media.map((file) => ({ name: `xl/media/${file.name}`, data: file.data })),
    );
  });
  const entries: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${mediaCount ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : ''}${drawingOverrides.join('')}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${named
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
    ...drawings,
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
