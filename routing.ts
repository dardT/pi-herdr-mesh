import { basename } from "node:path";
import type { PeerRecord } from "./catalog.js";

export type RankedPeer = { peer: PeerRecord; score: number; fresh: boolean };

const genericTerms = new Set(["a", "an", "and", "agent", "ask", "by", "doing", "find", "for", "in", "is", "me", "of", "on", "or", "session", "the", "to", "working"]);

function terms(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((term) => term.length > 2 && !genericTerms.has(term)))];
}

export function rankPeers(peers: PeerRecord[], query: string): RankedPeer[] {
  const words = terms(query);
  return peers.map((peer) => {
    const metadata = terms([peer.id, peer.name, peer.cwd, basename(peer.cwd), peer.branch].filter(Boolean).join(" "));
    const purpose = terms(peer.purpose ?? "");
    const metadataMatches = words.filter((word) => metadata.includes(word)).length;
    const purposeMatches = words.filter((word) => purpose.includes(word)).length;
    return {
      peer,
      score: 3 * metadataMatches + purposeMatches,
      fresh: peer.purpose !== undefined && peer.purposeRevision === peer.revision,
    };
  }).sort((a, b) => b.score - a.score || a.peer.id.localeCompare(b.peer.id));
}

export function clearMetadataMatch(peers: RankedPeer[], query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return peers.some(({ peer }) => peer.id.toLowerCase() === normalized || peer.name?.toLowerCase() === normalized || basename(peer.cwd).toLowerCase() === normalized);
}
