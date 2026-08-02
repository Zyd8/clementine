import { Tabs, usePathname, router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabBar } from '@/components/ui/TabBar';
import { useTheme } from '@/hooks/useTheme';
import { tabKeyForPath, hrefForTab, type TabKey } from '@/utils/tabs';

/**
 * The four tabbed screens. Setup and the voice overlay sit outside this group
 * — the design hides the tab bar on both.
 *
 * `Tabs` handles the routing; the bar itself is ours, because the design's
 * gold-top-border-on-active treatment is not something the default bar can be
 * configured into. Screen headers are off: each screen draws its own, per the
 * design's shared-header block.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const activeKey = tabKeyForPath(pathname);

  const onSelect = (key: TabKey) => router.navigate(hrefForTab(key));

  // These screens draw their own headers with `headerShown: false`, so nothing
  // else is reserving the status-bar strip — without this the first header
  // renders under the notch. The bar handles the bottom inset itself.
  return (
    <View
      style={{
        backgroundColor: theme.colors.canvas,
        flex: 1,
        paddingTop: insets.top,
      }}
    >
      <Tabs
        tabBar={() => <TabBar activeKey={activeKey} onSelect={onSelect} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: theme.colors.canvas },
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="sessions" />
        <Tabs.Screen name="profiles" />
        <Tabs.Screen name="settings" />
      </Tabs>
    </View>
  );
}
