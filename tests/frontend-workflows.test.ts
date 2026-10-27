import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/I18nProvider';
import { PublishingPresetPicker } from '../src/features/publishing/PublishingPresetPicker';
import {
  CourseProfileEditor,
  type CourseProfileDraft,
} from '../src/features/course-profiles/CourseProfilesPanel';
import { PermissionsRoleDetail } from '../src/features/permissions/PermissionsPanel';
import { ApprovalCard } from '../src/features/content-pipeline/ApprovalCard';
import { PUBLISHING_PRESETS } from '../src/domain/output-presets';
import { ROLES } from '../src/domain/catalog';
import type { PipelineItem } from '../src/features/content-pipeline/types';

function render(
  child: ReturnType<typeof createElement>,
  lang: 'ar' | 'en' = 'ar',
) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    value: { documentElement: { lang } },
    configurable: true,
  });
  try {
    return renderToStaticMarkup(createElement(I18nProvider, null, child));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}
const noop = () => {};
test('placement picker renders all 23 sizes and eight platforms in Arabic and English with the current selection', () => {
  for (const lang of ['ar', 'en'] as const) {
    const html = render(
      createElement(PublishingPresetPicker, {
        value: 'youtube-banner',
        format: 'landscape',
        onChange: noop,
        onFormatChange: noop,
      }),
      lang,
    );
    for (const preset of PUBLISHING_PRESETS)
      assert.ok(html.includes(`value="${preset.id}"`));
    assert.equal((html.match(/<optgroup/g) || []).length, 8);
    assert.match(html, /value="youtube-banner" selected=""/);
    assert.ok(html.includes('2560×1440'));
    assert.ok(!html.includes('undefined'));
    assert.ok(
      html.includes(lang === 'ar' ? 'الفيديو منفصل' : 'video is separate'),
    );
  }
});

test('course editor renders stored audience and goals, distinguishes drafts, and escapes imported text', () => {
  const draft: CourseProfileDraft = {
    courseId: 'test',
    courseName: 'دورة <script>alert(1)</script>',
    objectives: 'هدف أول\nهدف ثان',
    outcomes: 'لوحة',
    audience: 'المهندسون',
    notes: 'مسودة مقترحة',
    category: 'BIM',
    description: 'نبذة الدورة',
    sourceUrl: 'https://engosoft.com/shop',
    reviewStatus: 'suggested',
  };
  const html = render(
    createElement(CourseProfileEditor, {
      draft,
      update: noop,
      save: noop,
      busy: '',
    }),
  );
  assert.ok(html.includes('المهندسون'));
  assert.ok(html.includes('هدف أول\nهدف ثان'));
  assert.ok(html.includes('مسودة مقترحة'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('اعتمد واحفظ'));
  assert.ok(html.includes('افتح صفحة المصدر'));
  const approved = render(
    createElement(CourseProfileEditor, {
      draft: { ...draft, reviewStatus: 'approved' },
      update: noop,
      save: noop,
      busy: 'save',
    }),
  );
  assert.ok(approved.includes('data-status="approved"'));
  assert.ok(approved.includes('disabled=""'));
});

test('role directory renders every capability, with Operations limited to two defaults', () => {
  const html = render(
    createElement(PermissionsRoleDetail, { role: ROLES.operations }),
  );
  assert.equal((html.match(/class="permissions__row"/g) || []).length, 18);
  assert.equal((html.match(/data-enabled="true"/g) || []).length, 2);
  assert.ok(html.includes('فريق العمليات'));
  assert.ok(html.includes('الاعتماد وطلب التعديلات'));
});

const item: PipelineItem = {
  id: 'post',
  title: 'عنوان <script>bad()</script> طويل',
  status: 'ready_for_review',
  departmentId: 'operations',
  ownerId: 'ops',
  channels: ['youtube', 'facebook'],
  captions: {},
  creative: {
    requestId: 'ref',
    directionId: 'story',
    imageUrl: '/api/uploads/test.png',
  },
  scheduledAt: null,
  planIds: [],
  templateId: null,
  createdAt: '2026-10-27T10:00:00Z',
  updatedAt: '2026-10-27T10:00:00Z',
  moves: [{ to: 'approved', needsNote: false }],
  editable: false,
};
test('approval card renders channel labels and review actions from server moves, safely in RTL and LTR', () => {
  for (const lang of ['ar', 'en'] as const) {
    const html = render(
      createElement(ApprovalCard, {
        item,
        owner: 'Operations',
        department: 'القسم',
        busy: false,
        disabled: false,
        onOpen: noop,
        onApprove: noop,
      }),
      lang,
    );
    assert.ok(html.includes('YouTube'));
    assert.ok(html.includes('Facebook'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('ca-card__actions'));
    assert.ok(!html.includes('undefined'));
    assert.ok(!html.includes('<script>'));
  }
  const readOnly = render(
    createElement(ApprovalCard, {
      item: { ...item, moves: [] },
      owner: 'Operations',
      busy: false,
      disabled: false,
      onOpen: noop,
      onApprove: noop,
    }),
  );
  assert.ok(!readOnly.includes('ca-card__actions'));
  const approved = render(
    createElement(ApprovalCard, {
      item: { ...item, status: 'approved' },
      owner: 'Operations',
      busy: false,
      disabled: false,
      onOpen: noop,
      onApprove: noop,
    }),
  );
  assert.ok(!approved.includes('ca-card__actions'));
});
