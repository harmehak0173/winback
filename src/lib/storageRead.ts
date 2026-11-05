import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The stored value for a read-modify-write, or null when nothing is stored.
 *
 * The display readers treat any storage error as "empty", which is right for
 * showing a screen. For a write it is not: one failed read made the next log
 * entry replace the whole record, so 40 urges ridden out became 1. This tries
 * again once (a busy storage at launch is the usual cause) and then throws,
 * so the caller skips its write rather than overwrite what it could not see.
 */
export async function getItemForWrite(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return AsyncStorage.getItem(key);
  }
}
