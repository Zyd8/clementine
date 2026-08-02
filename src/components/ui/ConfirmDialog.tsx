import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  /** Label for the destructive/primary action (e.g. "DISCONNECT"). */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Centered confirmation dialog, built on a real `Modal` like ProfilePicker:
 * it draws above everything including the tab bar and takes the Android back
 * button, which dismisses (cancels) the dialog.
 *
 * The confirm action renders in the theme's `err` color — this component is
 * for destructive/irreversible decisions (disconnect, wipe, delete), and the
 * color makes the risk visible before the user commits. Cancel is steel.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'CANCEL',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        accessibilityLabel="Dismiss confirm dialog"
        onPress={onCancel}
        style={{ backgroundColor: 'rgba(10,11,13,0.6)', flex: 1, justifyContent: 'center' }}
      >
        {/* Swallows taps so pressing inside the dialog doesn't dismiss it. */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: theme.colors.canvas,
            borderColor: theme.colors.steel,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            marginHorizontal: theme.spacing.md,
            padding: theme.spacing.md,
          }}
        >
          <Text
            style={{
              color: theme.colors.ink,
              fontFamily: theme.typography.heading.fontFamily,
              fontSize: theme.typography.heading.fontSize,
              marginBottom: theme.spacing.xs,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              color: theme.colors.inkMuted,
              fontFamily: theme.typography.body.fontFamily,
              fontSize: theme.typography.body.fontSize,
              lineHeight: theme.typography.body.lineHeight,
              marginBottom: theme.spacing.md,
            }}
          >
            {message}
          </Text>

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              onPress={() => onCancel()}
              style={{
                backgroundColor: theme.colors.canvasRaised,
                borderColor: theme.colors.steel,
                borderRadius: theme.radius.sm,
                borderWidth: 1,
                flex: 1,
                paddingVertical: theme.spacing.sm + theme.spacing.xs,
              }}
            >
              <Text
                style={{
                  color: theme.colors.ink,
                  fontFamily: theme.typography.body.fontFamily,
                  fontSize: theme.typography.body.fontSize,
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                {cancelLabel}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              onPress={() => onConfirm()}
              style={{
                backgroundColor: theme.colors.err,
                borderRadius: theme.radius.sm,
                flex: 1,
                paddingVertical: theme.spacing.sm + theme.spacing.xs,
              }}
            >
              <Text
                style={{
                  color: theme.colors.canvas,
                  fontFamily: theme.typography.body.fontFamily,
                  fontSize: theme.typography.body.fontSize,
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
