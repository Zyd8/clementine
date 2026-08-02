import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

/** Structurally the profiles store's `Profile`, restated so components stay above stores. */
type PickerProfile = { id: string; name: string };

type ProfilePickerProps = {
  visible: boolean;
  onClose: () => void;
  /** Shown in the sheet title, so the user knows which host they're switching within. */
  endpointName: string;
  profiles: readonly PickerProfile[];
  activeId: string;
  onSelectProfile: (id: string) => void;
};

/**
 * Bottom-sheet profile switcher.
 *
 * A real `Modal` rather than an absolutely-positioned overlay: the design
 * draws it above everything including the tab bar, and on Android only a
 * Modal reliably takes the back button, which is the gesture people expect to
 * dismiss a sheet.
 */
export function ProfilePicker({
  visible,
  onClose,
  endpointName,
  profiles,
  activeId,
  onSelectProfile,
}: ProfilePickerProps) {
  const theme = useTheme();

  const onSelect = (id: string) => {
    onSelectProfile(id);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="Dismiss profile picker"
        onPress={onClose}
        style={{ backgroundColor: 'rgba(10,11,13,0.6)', flex: 1, justifyContent: 'flex-end' }}
      >
        {/* Swallows taps so choosing inside the sheet doesn't dismiss it. */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: theme.colors.canvas,
            borderTopColor: theme.colors.steel,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderTopWidth: 1,
            padding: theme.spacing.md,
          }}
        >
          <Text
            style={{
              color: theme.colors.inkMuted,
              fontFamily: theme.fonts.regular,
              fontSize: theme.type(10.5),
              letterSpacing: 0.8,
              marginBottom: 10,
            }}
          >
            {`SWITCH PROFILE — ${endpointName}`}
          </Text>

          <View style={{ gap: 6 }}>
            {profiles.map((profile) => {
              const active = profile.id === activeId;
              return (
                <Pressable
                  key={profile.id}
                  testID={`picker-${profile.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => onSelect(profile.id)}
                  style={{
                    alignItems: 'center',
                    backgroundColor: theme.colors.canvasRaised,
                    borderColor: active ? theme.colors.gold : theme.colors.steel,
                    borderRadius: theme.radius.sm,
                    borderWidth: 1,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    padding: 12,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.ink,
                      fontFamily: theme.fonts.semibold,
                      fontSize: theme.type(13.5),
                    }}
                  >
                    {profile.name}
                  </Text>
                  {active ? (
                    <Text
                      style={{
                        color: theme.colors.gold,
                        fontFamily: theme.fonts.semibold,
                        fontSize: theme.type(10.5),
                      }}
                    >
                      ACTIVE
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
