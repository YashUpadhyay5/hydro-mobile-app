import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';
import { attachmentFileName, isPdfAttachment, openPdf, resolveAttachmentUrl } from '@/utils/attachment';

interface AttachmentPreviewProps {
  /** What the server stored (absolute URL or relative path). */
  source?: string | null;
  isDark: boolean;
  /** `thumb` fills a small card column, `full` is the large preview inside an expanded card. */
  variant: 'thumb' | 'full';
}

export default function AttachmentPreview({ source, isDark, variant }: AttachmentPreviewProps) {
  const { t } = useTranslationSafe(['expense', 'common']);
  const [opening, setOpening] = useState(false);
  const url = resolveAttachmentUrl(source);
  const isThumb = variant === 'thumb';

  if (!url) return null;

  if (!isPdfAttachment(url)) {
    return (
      <Image
        source={{ uri: url }}
        className={isThumb ? `w-[100px] min-h-[110px] ${isDark ? 'bg-slate-900' : 'bg-surface'}` : `w-full h-[200px] rounded-lg ${isDark ? 'bg-slate-900' : 'bg-surface'}`}
        resizeMode={isThumb ? 'cover' : 'contain'}
      />
    );
  }

  const open = async () => {
    if (opening) return;
    setOpening(true);
    const ok = await openPdf(url, attachmentFileName(url, 'invoice.pdf'));
    setOpening(false);
    if (!ok) {
      Alert.alert(
        t('common:error', { defaultValue: 'Error' }),
        t('expense:pdf_open_failed', { defaultValue: 'Could not open this PDF. Check your connection and try again.' })
      );
    }
  };

  const tint = isDark ? '#F87171' : '#DC2626';
  return (
    <TouchableOpacity
      onPress={open}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={t('expense:open_pdf', { defaultValue: 'Open PDF' })}
      className={`${isThumb ? 'w-[100px] min-h-[110px] border-r' : 'w-full h-[96px] rounded-lg border border-dashed'} items-center justify-center px-2 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-red-50 border-red-200'}`}
    >
      {opening ? (
        <ActivityIndicator color={tint} />
      ) : (
        <Ionicons name="document-text" size={isThumb ? 30 : 34} color={tint} />
      )}
      <Text className={`text-[11px] font-bold mt-1 ${isDark ? 'text-red-300' : 'text-red-600'}`}>{t('expense:pdf_label', { defaultValue: 'PDF' })}</Text>
      <Text className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-text-muted'}`} numberOfLines={1}>
        {t('expense:open_pdf', { defaultValue: 'Open PDF' })}
      </Text>
    </TouchableOpacity>
  );
}
