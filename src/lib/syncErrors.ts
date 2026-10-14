import { SyncError } from '../store/sync';

export function syncErrorMessage(error: unknown, serverUrl: string): string {
  const reason = error instanceof SyncError ? error.reason : 'offline';
  switch (reason) {
    case 'not_found':
      return 'لا توجد لوحة بهذا الرمز. تأكد من الرمز وحاول مجددًا.';
    case 'code_taken':
      return 'حدث تعارض في الرمز، حاول مرة أخرى.';
    case 'bad_request':
      return 'رفض الخادم الطلب.';
    default:
      return `تعذّر الوصول إلى خادم المزامنة (${serverUrl}). شغّله على جهاز الكمبيوتر بالأمر npm run server، وتأكد أن الجهازين على الشبكة نفسها.`;
  }
}
