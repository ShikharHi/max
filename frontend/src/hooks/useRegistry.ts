"use client";

import { useCallback, useEffect } from "react";
import { api } from "@/lib/api";
import { useJarvisStore } from "@/store/useJarvisStore";

export function useRegistry(autoLoad = false) {
  const { setConnectionError, setRegistry, setRegistryLoading, updateRegistryEntry } = useJarvisStore();

  const loadRegistry = useCallback(async () => {
    setRegistryLoading(true);
    try {
      const entries = await api.getRegistry();
      setRegistry(entries);
      setConnectionError(null);
    } catch {
      setConnectionError(`Cannot connect to JARVIS at ${api.baseUrl.replace(/^https?:\/\//, "")} - check your server`);
    } finally {
      setRegistryLoading(false);
    }
  }, [setConnectionError, setRegistry, setRegistryLoading]);

  const addToStack = useCallback(
    async (name: string) => {
      updateRegistryEntry(name, true);
      try {
        await api.plugin(name);
      } catch {
        updateRegistryEntry(name, false);
      }
    },
    [updateRegistryEntry]
  );

  const toggle = useCallback(
    async (name: string, active: boolean) => {
      updateRegistryEntry(name, active);
      try {
        if (active) await api.plugin(name);
        else await api.plugout(name);
      } catch {
        updateRegistryEntry(name, !active);
      }
    },
    [updateRegistryEntry]
  );

  const reload = useCallback(async () => {
    setRegistryLoading(true);
    try {
      await api.reloadRegistry();
      await loadRegistry();
    } finally {
      setRegistryLoading(false);
    }
  }, [loadRegistry, setRegistryLoading]);

  useEffect(() => {
    if (autoLoad) void loadRegistry();
  }, [autoLoad, loadRegistry]);

  return { loadRegistry, addToStack, toggle, reload };
}
