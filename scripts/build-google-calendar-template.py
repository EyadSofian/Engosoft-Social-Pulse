"""Rebuild the fill-in publishing template from its documented format. Requires openpyxl."""
import json
from datetime import datetime, time
from pathlib import Path
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.comments import Comment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.table import Table, TableStyleInfo

ROOT = Path(__file__).resolve().parents[1]
spec = json.loads((ROOT / 'docs/google-calendar-format.json').read_text())
wb = Workbook()
ws = wb.active
ws.title = 'Calendar'
example = wb.create_sheet('Example')
guide = wb.create_sheet('Guide')
platforms = wb.create_sheet('Platforms')
HEADERS = spec['headers']
for sheet in (ws, example):
    sheet.append(HEADERS)
    sheet.freeze_panes = 'F2'
    sheet.sheet_view.zoomScale = 80
    end = 101 if sheet is ws else 2
    for row in sheet.iter_rows(min_row=2, max_row=end, max_col=len(HEADERS)):
        for c in row:
            c.font = Font(name='Arial', size=11, color='174A77')
            c.fill = PatternFill('solid', fgColor='EDF0F3' if c.column in (12, 13, 14) else 'F3FAF8')
            c.alignment = Alignment(vertical='top', wrap_text=True)
            c.number_format = '@'
        row[1].number_format = 'yyyy-mm-dd'
        row[2].number_format = 'hh:mm'
    for col, choices in [('D', 'Africa/Cairo,Asia/Riyadh,Asia/Dubai'), ('H', 'image,reel,video,carousel'), ('J', 'NO,YES'), ('O', 'private,unlisted,public'), ('Q', 'NO,YES'), ('R', 'PUBLIC_TO_EVERYONE,MUTUAL_FOLLOW_FRIENDS,FOLLOWER_OF_CREATOR,SELF_ONLY'), ('S', 'NO,YES'), ('T', 'story,spotlight'), ('U', 'none,own,paid,both')]:
        validation = DataValidation(type='list', formula1=f'"{choices}"', allow_blank=True)
        validation.showErrorMessage = True
        validation.errorStyle = 'stop'
        validation.error = 'اختر قيمة من القائمة.'
        sheet.add_data_validation(validation)
        validation.add(f'{col}2:{col}1001')
    sheet.auto_filter.ref = f'A1:V{end}'
    for i, name in enumerate(HEADERS, 1):
        sheet.column_dimensions[sheet.cell(1, i).column_letter].width = 22
        entry = next((r[1] for r in spec['guide'] if name in r[0].split(' / ')), '')
        if entry:
            sheet.cell(1, i).comment = Comment(entry, 'Engosoft')
    for col, width in [('E', 34), ('F', 65), ('G', 55), ('I', 42), ('K', 48), ('M', 48), ('N', 48)]:
        sheet.column_dimensions[col].width = width
    sheet.print_title_rows = '1:1'
table = Table(displayName='GooglePublishingCalendar', ref='A1:V101')
table.tableStyleInfo = TableStyleInfo(name='TableStyleMedium2', showRowStripes=False)
ws.add_table(table)
e = spec['example']
sample = [e['id'], datetime.fromisoformat(e['date']), time.fromisoformat(e['time']), e['timezone'], e['title'], e['caption'], e['design'], e['mediaType'], e['platform'], e['ready'], 'مثال من الشيت الأصلي بتاريخ مضى، ليس طلب نشر؛ حدّد تاريخًا مستقبليًا عند الاستخدام.']
for i, value in enumerate(sample, 1):
    example.cell(2, i, value)
example.row_dimensions[2].height = 320
example['B2'].comment = Comment('التاريخ الأصلي المخزّن في المصدر 11 سبتمبر 2026. لم نفترض تحويله إلى نوفمبر.', 'Engosoft')
example['G2'].hyperlink = e['design']
for sheet, rows in [(guide, spec['guide']), (platforms, spec['platforms'])]:
    sheet.sheet_view.rightToLeft = True
    sheet.freeze_panes = 'A2'
    for row in rows:
        sheet.append(row)
    for row in sheet:
        sheet.row_dimensions[row[0].row].height = 65
        for c in row:
            c.font = Font(name='Arial', size=11)
            c.fill = PatternFill('solid', fgColor='F3FAF8' if c.row % 2 == 0 else 'FFFFFF')
            c.alignment = Alignment(vertical='top', wrap_text=True, readingOrder=2)
    for col in range(1, sheet.max_column + 1):
        sheet.column_dimensions[sheet.cell(1, col).column_letter].width = 30
    sheet.column_dimensions[sheet.cell(1, sheet.max_column).column_letter].width = 100
for sheet in wb:
    sheet.row_dimensions[1].height = 38
    for c in sheet[1]:
        c.fill = PatternFill('solid', fgColor='143047')
        c.font = Font(name='Arial', size=11, bold=True, color='FFFFFF')
        c.alignment = Alignment(vertical='center', wrap_text=True)
    sheet.sheet_properties.tabColor = '1769AA'
wb.properties.title = 'Engosoft Google Sheets & Drive Publishing Calendar'
wb.properties.description = 'Fill Calendar; Example is illustrative. Gray result columns are written by the app. Connect Google and select accounts before enabling automatic posting.'
path = ROOT / 'public/templates/google-publishing-calendar.xlsx'
path.parent.mkdir(parents=True, exist_ok=True)
wb.save(path)
check = load_workbook(path)
assert check.sheetnames == ['Calendar', 'Example', 'Guide', 'Platforms']
assert [c.value for c in check['Calendar'][1]] == HEADERS
assert all(check['Calendar'].cell(2, i).value is None for i in range(1, len(HEADERS) + 1))
assert check['Example']['J2'].value == 'NO'
assert check['Example']['B2'].value == datetime(2026, 9, 11)
assert not any(c.data_type in ('f', 'e') for sheet in check for row in sheet for c in row)
print(f'Built and verified {path} ({len(HEADERS)} columns; no formulas).')
