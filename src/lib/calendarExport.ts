import { inZone } from './format';
import { platformLatin, platformName, statusLabel } from './platforms';
import type { Plan } from '../types';

/** Same headers as the import template, so an exported plan can be edited and re-uploaded. */
const CSV_HEADERS = [
  'Date',
  'Time',
  'Platform',
  'Account ID',
  'Post Title',
  'Caption',
  'Content Type',
  'Campaign',
  'Owner',
  'Status',
  'Published URL',
  'External Post ID',
  'Notes',
];

const csvCell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function plansToCsv(plans: Plan[]): string {
  const rows = [...plans]
    .sort((a, b) => a.ts - b.ts)
    .map((plan) => {
      const local = inZone(plan.ts);
      return [
        local.toFormat('yyyy-LL-dd'),
        local.toFormat('HH:mm'),
        plan.platform,
        plan.accountId,
        plan.title,
        plan.caption,
        plan.contentType,
        plan.campaign,
        plan.owner,
        plan.status,
        plan.permalink,
        plan.externalId,
        plan.notes,
      ]
        .map((value) => csvCell(value ?? ''))
        .join(',');
    });
  // The BOM makes Excel open the Arabic text as UTF-8.
  return `\uFEFF${[CSV_HEADERS.join(','), ...rows].join('\r\n')}\r\n`;
}

const icsText = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** RFC 5545 folds lines at 75 octets; never split a multi-byte character. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function plansToIcs(plans: Plan[], now = Date.now()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Engosoft//Mobde3//AR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:مبدع — خطة المحتوى',
  ];
  for (const plan of plans) {
    if (!Number.isFinite(plan.ts)) continue;
    const description = [
      plan.caption,
      `المنصة: ${platformName[plan.platform]}`,
      `الحالة: ${statusLabel[plan.status]}`,
      plan.owner && `المسؤول: ${plan.owner}`,
      plan.campaign && `الحملة: ${plan.campaign}`,
      plan.notes && `ملاحظات: ${plan.notes}`,
    ]
      .filter(Boolean)
      .join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${plan.id}@social-pulse.engosoft`,
      `DTSTAMP:${icsStamp(now)}`,
      `DTSTART:${icsStamp(plan.ts)}`,
      'DURATION:PT30M',
      `SUMMARY:${icsText(`[${platformLatin[plan.platform]}] ${plan.title}`)}`,
      `DESCRIPTION:${icsText(description)}`,
      `STATUS:${plan.status === 'cancelled' ? 'CANCELLED' : plan.status === 'draft' ? 'TENTATIVE' : 'CONFIRMED'}`,
    );
    if (plan.campaign) lines.push(`CATEGORIES:${icsText(plan.campaign)}`);
    if (plan.permalink) lines.push(`URL:${plan.permalink}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
