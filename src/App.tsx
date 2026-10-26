import { MotionConfig } from 'motion/react';
import { LiveDataProvider } from './app/providers/LiveDataProvider';
import { RouterProvider } from './app/router/router';
import { ToastProvider } from './components/feedback/Toast';
import { CreateContentProvider } from './features/content/CreateContent';
import { WorkspaceProvider } from './features/workspace/WorkspaceProvider';
import { I18nProvider, useI18n } from './i18n/I18nProvider';
import { AppShell } from './shell/AppShell';
import { ShellProvider } from './shell/ShellContext';

/**
 * Provider order: language first (everything reads it), then toasts, routing,
 * the workflow workspace, the live API data, and the shell's own UI state.
 */
export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <I18nProvider>
        <Toasts />
      </I18nProvider>
    </MotionConfig>
  );
}

function Toasts() {
  const { t } = useI18n();
  return (
    <ToastProvider closeLabel={t('Close', 'إغلاق')}>
      <RouterProvider>
        <WorkspaceProvider>
          <LiveDataProvider>
            <ShellProvider>
              <CreateContentProvider>
                <AppShell />
              </CreateContentProvider>
            </ShellProvider>
          </LiveDataProvider>
        </WorkspaceProvider>
      </RouterProvider>
    </ToastProvider>
  );
}
