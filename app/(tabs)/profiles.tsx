import * as ImagePicker from 'expo-image-picker';
import React, { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useKeyboardOverlap } from '@/hooks/useKeyboardOverlap';
import { useTheme } from '@/hooks/useTheme';
import { useConnectionStore } from '@/stores/connection';
import { useProfilesStore } from '@/stores/profiles';
import { persistAvatarImage } from '@/utils/avatarImage';

/**
 * Profiles — the switchable unit within the one connected Hermes instance.
 *
 * These are local labels. The host was verified single-profile on 2026-08-02
 * (`/v1/profiles` → 404), so switching does not change which server you talk
 * to; it repartitions the local feed and token totals, which the chat and
 * usage stores already key by `profileId`. That is genuinely useful — one
 * scrollback for personal work, another for a job — and it is honest about
 * what it does.
 */
export default function ProfilesScreen() {
  const theme = useTheme();
  const screenRef = useRef<View>(null);
  const keyboardOverlap = useKeyboardOverlap(screenRef);
  const connection = useConnectionStore((s) => s.connection);
  const disconnect = useConnectionStore((s) => s.disconnect);

  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Picks an image from the gallery, copies it into the app's document
  // directory (the picker only hands us a cache URI that can be evicted),
  // and stores the stable file URI on the profile.
  const pickAvatar = async (profileId: string) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = await persistAvatarImage(result.assets[0].uri, profileId);
    await setAvatar(profileId, uri);
  };

  const profiles = useProfilesStore((s) => s.profiles);
  const activeId = useProfilesStore((s) => s.activeId);
  const rename = useProfilesStore((s) => s.rename);
  const setAvatar = useProfilesStore((s) => s.setAvatar);
  const select = useProfilesStore((s) => s.select);
  const add = useProfilesStore((s) => s.add);

  return (
    <View
      ref={screenRef}
      style={{
        backgroundColor: theme.colors.canvas,
        flex: 1,
        // Ends the scroll viewport at the keyboard's top edge. Padding the
        // content alone leaves the viewport under the keyboard, so nothing
        // the user scrolls to is actually visible.
        paddingBottom: keyboardOverlap,
      }}
    >
      <View
        style={{
          borderBottomColor: theme.colors.steel,
          borderBottomWidth: 1,
          gap: theme.spacing.xs,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: 14,
        }}
      >
        <Text
          style={{
            color: theme.colors.ink,
            fontFamily: theme.fonts.semibold,
            fontSize: theme.type(13),
            letterSpacing: 0.5,
          }}
        >
          PROFILES
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.inkMuted,
            fontFamily: theme.fonts.regular,
            fontSize: theme.type(11),
          }}
        >
          {connection
            ? `${connection.name} · ${connection.baseUrl}`
            : 'no hermes connected'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ gap: 10, padding: theme.spacing.md, paddingBottom: theme.spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{
            color: theme.colors.inkMuted,
            fontFamily: theme.fonts.regular,
            fontSize: theme.type(10),
            letterSpacing: 0.6,
            paddingHorizontal: 2,
          }}
        >
          TAP AVATAR TO UPLOAD AN IMAGE · TAP NAME TO EDIT · SELECT TO SWITCH
        </Text>

        {profiles.map((profile) => {
          const active = profile.id === activeId;
          return (
            <View
              key={profile.id}
              testID={`profile-${profile.id}`}
              style={{
                alignItems: 'center',
                backgroundColor: theme.colors.canvasRaised,
                borderColor: active ? theme.colors.gold : theme.colors.steel,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                flexDirection: 'row',
                gap: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Change avatar for ${profile.name}`}
                onPress={() => void pickAvatar(profile.id)}
                style={{
                  backgroundColor: theme.colors.canvas,
                  borderColor: active ? theme.colors.gold : theme.colors.steel,
                  borderRadius: theme.radius.full,
                  borderWidth: 1,
                  flexShrink: 0,
                  height: 34,
                  overflow: 'hidden',
                  width: 34,
                }}
              >
                <Avatar initials={profile.avatar} size={44} active={active} />
              </Pressable>
              <TextInput
                aria-label={`Name for ${profile.name}`}
                value={profile.name}
                onChangeText={(text) => void rename(profile.id, text)}
                style={{
                  borderBottomColor: theme.colors.steel,
                  borderBottomWidth: 1,
                  color: theme.colors.ink,
                  flex: 1,
                  fontFamily: theme.fonts.regular,
                  fontSize: theme.type(13),
                  minWidth: 0,
                  paddingHorizontal: 2,
                  paddingVertical: 4,
                }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={active ? `${profile.name} active` : `Switch to ${profile.name}`}
                onPress={() => void select(profile.id)}
                style={{
                  backgroundColor: active ? theme.colors.gold : 'transparent',
                  borderColor: active ? theme.colors.gold : theme.colors.steel,
                  borderRadius: theme.radius.sm,
                  borderWidth: 1,
                  flexShrink: 0,
                  paddingHorizontal: 9,
                  paddingVertical: 6,
                }}
              >
                <Text
                  style={{
                    color: active ? theme.colors.canvas : theme.colors.inkMuted,
                    fontFamily: theme.fonts.bold,
                    fontSize: theme.type(10),
                    letterSpacing: 0.4,
                  }}
                >
                  {active ? 'ACTIVE' : 'SELECT'}
                </Text>
              </Pressable>
            </View>
          );
        })}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add profile"
          onPress={() => void add('new profile')}
          style={{
            alignItems: 'center',
            borderColor: theme.colors.steel,
            borderRadius: theme.radius.md,
            borderStyle: 'dashed',
            borderWidth: 1,
            flexDirection: 'row',
            gap: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Avatar initials="+" size={44} active={false} />
          <Text
            style={{
              color: theme.colors.inkMuted,
              fontFamily: theme.fonts.regular,
              fontSize: theme.type(12),
            }}
          >
            ADD PROFILE
          </Text>
        </Pressable>

        <Text
          style={{
            color: theme.colors.inkMuted,
            fontFamily: theme.fonts.regular,
            fontSize: theme.type(10.5),
            lineHeight: 16,
            paddingHorizontal: 2,
          }}
        >
          this hermes runs a single profile server-side — switching here keeps a
          separate local scrollback and token count per profile
        </Text>

        {connection ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Disconnect hermes instance"
            onPress={() => setConfirmDisconnect(true)}
            style={{
              borderColor: theme.colors.steel,
              borderRadius: theme.radius.md,
              borderStyle: 'dashed',
              borderWidth: 1,
              marginTop: 6,
              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                color: theme.colors.inkMuted,
                fontFamily: theme.fonts.regular,
                fontSize: theme.type(11.5),
                textAlign: 'center',
              }}
            >
              DISCONNECT HERMES INSTANCE
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {confirmDisconnect ? (
        <ConfirmDialog
          visible
          title="Disconnect this Hermes instance?"
          message="This wipes the local connection, session and profile state on this device. The server is untouched — you can reconnect at any time."
          confirmLabel="DISCONNECT"
          onConfirm={() => {
            setConfirmDisconnect(false);
            void disconnect();
          }}
          onCancel={() => setConfirmDisconnect(false)}
        />
      ) : null}
    </View>
  );
}
