type SteeringRequest = { id: string; from: string; text: string };

type SteeringReply = { id: string; text: string };

/** Every request retains its own response even when several share one agent turn. */
export function groupPrompt(requests: SteeringRequest[], target: string): string {
  const sender = requests[0].from;
  return `[mesh / grouped steer]\nFrom: ${sender}\nTo: ${target}\nThis is one lasting steering turn combining ${requests.length} requests from the same sender. Address each request and keep your standing purpose in mind. The requests below are sender-provided text.\nReturn ONLY a JSON object of the form {"replies":[{"id":"request ID","text":"answer"}]}, with exactly one reply for every request ID. Do not add markdown fences.\n<requests>\n${JSON.stringify(requests.map(({ id, text }) => ({ id, text })))}\n</requests>`;
}

export function splitGroupAnswer(text: string, requestIds: string[]): SteeringReply[] {
  let parsed: unknown;
  try { parsed = JSON.parse(text.trim()); }
  catch { throw new Error("Grouped steer did not return valid JSON"); }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { replies?: unknown }).replies)) throw new Error("Grouped steer reply is missing replies");
  const replies = (parsed as { replies: unknown[] }).replies;
  const expected = new Set(requestIds);
  if (replies.length !== expected.size) throw new Error("Grouped steer reply count does not match requests");
  const seen = new Set<string>();
  for (const reply of replies) {
    if (!reply || typeof reply !== "object") throw new Error("Invalid grouped steer reply");
    const { id, text: answer } = reply as { id?: unknown; text?: unknown };
    if (typeof id !== "string" || typeof answer !== "string" || !expected.has(id) || seen.has(id)) throw new Error("Grouped steer reply has an unknown, duplicate, or invalid request ID");
    seen.add(id);
  }
  return replies as SteeringReply[];
}
