import { LazyStore } from "@tauri-apps/plugin-store";

/**
 * Shared persistence store. All hooks and views read/write the same
 * deskall.json file through this single instance.
 */
export const store = new LazyStore("deskall.json");
