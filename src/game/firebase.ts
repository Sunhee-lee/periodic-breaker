// ============================================================
// Element Breaker – Firebase Ranking System
// ============================================================

import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, get } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyB9zBeqnYsckglsUuWcKOZuuHddfBf6Aro",
  authDomain: "element-breaker-55a61.firebaseapp.com",
  databaseURL: "https://element-breaker-55a61-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "element-breaker-55a61",
  storageBucket: "element-breaker-55a61.firebasestorage.app",
  messagingSenderId: "395231375755",
  appId: "1:395231375755:web:2524ae1dbea706e54e3f8e",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export interface RankEntry {
  name: string;
  score: number;
  level: number;
  discovered: number;
  timestamp: number;
}

/** Save a score to the ranking */
export async function saveRank(entry: Omit<RankEntry, "timestamp">): Promise<void> {
  try {
    const rankRef = ref(db, "rankings");
    await push(rankRef, { ...entry, timestamp: Date.now() });
  } catch (e) {
    console.error("Failed to save rank:", e);
  }
}

/** Get top N rankings sorted by score (descending) */
export async function getTopRanks(n: number = 10): Promise<RankEntry[]> {
  try {
    const rankRef = ref(db, "rankings");
    const snapshot = await get(rankRef);
    if (!snapshot.exists()) return [];
    const entries: RankEntry[] = [];
    snapshot.forEach((child) => {
      entries.push(child.val() as RankEntry);
    });
    // Sort by score descending, take top N
    return entries.sort((a, b) => b.score - a.score).slice(0, n);
  } catch (e) {
    console.error("Failed to get ranks:", e);
    return [];
  }
}
