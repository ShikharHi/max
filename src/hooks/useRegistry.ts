"use client";

import { useCallback, useEffect } from "react";
import { api } from "@/lib/api";
import { useJarvisStore } from "@/store/useJarvisStore";

export function useRegistry(autoLoad = true) {
  const registry = useJarvisStore((state) => state.registry);
  const setRegistry = useJarvisStore((state) => state.setRegistry);
  const setRegistryLoading = useJarvisStore((state) => state.setRegistryLoading);
  const updateRegistryActive = useJarvisStore((state) => state.updateRegistryActive);

  const refreshRegistry = useCallback(async () => {
    setRegistryLoading(true);
    try {
      const data = await api.listRegistry();
      setRegistry(data);
    } finally {
      setRegistryLoading(false);
    }
  }, [setRegistry, setRegistryLoading]);

  const reloadRegistry = useCallback(async () => {
    setRegistryLoading(true);
    try {
      await api.reloadRegistry();
      await refreshRegistry();
    } finally {
      setRegistryLoading(false);
    }
  }, [refreshRegistry, setRegistryLoading]);

  const enablePlugin = useCallback(
    async (name: string) => {
      updateRegistryActive(name, true);
      try {
        await api.plugin(name);
      } catch (error) {
        updateRegistryActive(name, false);
        throw error;
      }
    },
    [updateRegistryActive]
  );

  const disablePlugin = useCallback(
    async (name: string) => {
      updateRegistryActive(name, false);
      try {
        await api.plugout(name);
      } catch (error) {
        updateRegistryActive(name, true);
        throw error;
      }
    },
    [updateRegistryActive]
  );

  useEffect(() => {
    if (autoLoad) {
      void refreshRegistry();
    }
  }, [autoLoad, refreshRegistry]);

  return {
    registry,
    refreshRegistry,
    reloadRegistry,
    enablePlugin,
    disablePlugin
  };
}
