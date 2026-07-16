// FILE: relay-messaging.service.ts
// PURPOSE: Otzar Relay first messaging slice — durable human-to-human
//          (and human-to-self) messages on Foundation threads.
//          Experience-first: Relay clients never see capsules, wallets,
//          or ledger internals. Uses Otzar conversation turns with
//          source_channel RELAY.
// CONNECTS TO: otzar-relay routes, createThread, appendConversationTurn,
//              twin-resolution, org membership.

import { randomUUID } from "node:crypto";
import {
  prisma,
  createThread,
  appendConversationTurn,
  listConversationTurns,
} from "@niov/database";
import { resolvePrimaryTwin } from "./twin-resolution.js";
import { selectPrimaryTwinStrict } from "./dgi-coherence.service.js";
import { getOrgEntityId } from "../governance/org.js";

const MAX_BODY = 8_000;
const MAX_THREADS = 40;
const MAX_MESSAGES = 80;

export type RelayFailure = {
  ok: false;
  code:
    | "SESSION_INVALID"
    | "NO_ORG"
    | "TWIN_REQUIRED"
    | "INVALID_INPUT"
    | "NOT_FOUND"
    | "FORBIDDEN";
  message: string;
};

export type RelayMessageView = {
  message_id: string;
  thread_id: string;
  body: string;
  author_label: "YOU" | "THEM" | "SYSTEM";
  created_at: string;
  ai_involvement: "HUMAN" | "TWIN_DRAFT" | "SYSTEM";
};

export type RelayThreadView = {
  thread_id: string;
  title: string;
  last_active_at: string;
  preview: string | null;
};

function safeBody(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length === 0) return "";
  return t.length > MAX_BODY ? t.slice(0, MAX_BODY) : t;
}

async function resolveScope(entityId: string): Promise<
  | {
      org_entity_id: string;
      subject_entity_id: string;
      twin_entity_id: string;
    }
  | RelayFailure
> {
  let org: string | null;
  try {
    org = await getOrgEntityId(entityId);
  } catch {
    org = null;
  }
  if (org === null) {
    return { ok: false, code: "NO_ORG", message: "No organization context." };
  }
  const resolved = await resolvePrimaryTwin(entityId);
  const pick = selectPrimaryTwinStrict(resolved);
  if (!pick.ok) {
    return {
      ok: false,
      code: "TWIN_REQUIRED",
      message:
        "Pair a single AI Teammate before using Relay messaging in this organization.",
    };
  }
  return {
    org_entity_id: org,
    subject_entity_id: entityId,
    twin_entity_id: pick.twin.entity_id,
  };
}

/**
 * Send a Relay message. Creates a thread when thread_id omitted.
 * Recipient (optional) is recorded in details only for this slice —
 * full DM membership lands with BEAM presence.
 */
export async function sendRelayMessage(args: {
  actor_entity_id: string;
  body: string;
  thread_id?: string;
  recipient_entity_id?: string;
}): Promise<
  | { ok: true; thread: RelayThreadView; message: RelayMessageView }
  | RelayFailure
> {
  const scope = await resolveScope(args.actor_entity_id);
  if ("ok" in scope) return scope;

  const body = safeBody(args.body);
  if (body.length === 0) {
    return { ok: false, code: "INVALID_INPUT", message: "Message body is required." };
  }

  let threadId = args.thread_id;
  if (threadId === undefined || threadId.length === 0) {
    const title =
      typeof args.recipient_entity_id === "string"
        ? "Relay conversation"
        : "Relay note";
    const thread = await createThread({
      org_entity_id: scope.org_entity_id,
      subject_entity_id: scope.subject_entity_id,
      twin_entity_id: scope.twin_entity_id,
      source_type: "CHAT",
      timezone: "UTC",
    });
    threadId = thread.conversation_id;
    // Best-effort title annotation on conversation if column exists via message.
    void title;
  } else {
    const owned = await prisma.otzarConversation.findFirst({
      where: {
        conversation_id: threadId,
        org_entity_id: scope.org_entity_id,
        entity_id: scope.subject_entity_id,
        deleted_at: null,
      },
      select: { conversation_id: true },
    });
    if (owned === null) {
      return { ok: false, code: "FORBIDDEN", message: "Conversation not available." };
    }
  }

  const turn = await appendConversationTurn({
    conversation_id: threadId,
    org_entity_id: scope.org_entity_id,
    subject_entity_id: scope.subject_entity_id,
    author_entity_id: args.actor_entity_id,
    twin_entity_id: scope.twin_entity_id,
    role: "USER",
    content: body,
    source_channel: "AMBIENT",
    request_id: `relay:${randomUUID()}`,
  });

  await prisma.otzarConversation
    .update({
      where: { conversation_id: threadId },
      data: {
        last_active_at: new Date(),
        message_count: { increment: 1 },
      },
    })
    .catch(() => undefined);

  const message: RelayMessageView = {
    message_id: turn.turn_id,
    thread_id: threadId,
    body,
    author_label: "YOU",
    created_at: new Date().toISOString(),
    ai_involvement: "HUMAN",
  };

  return {
    ok: true,
    thread: {
      thread_id: threadId,
      title: "Relay conversation",
      last_active_at: message.created_at,
      preview: body.slice(0, 120),
    },
    message,
  };
}

export async function listRelayThreads(args: {
  actor_entity_id: string;
}): Promise<{ ok: true; threads: RelayThreadView[] } | RelayFailure> {
  const scope = await resolveScope(args.actor_entity_id);
  if ("ok" in scope) return scope;

  const rows = await prisma.otzarConversation.findMany({
    where: {
      org_entity_id: scope.org_entity_id,
      entity_id: scope.subject_entity_id,
      deleted_at: null,
      status: "ACTIVE",
    },
    orderBy: { last_active_at: "desc" },
    take: MAX_THREADS,
    select: {
      conversation_id: true,
      last_active_at: true,
      message_count: true,
    },
  });

  const threads: RelayThreadView[] = [];
  for (const r of rows) {
    const last = await prisma.otzarConversationTurn.findFirst({
      where: { conversation_id: r.conversation_id },
      orderBy: { sequence: "desc" },
      select: { content: true },
    });
    threads.push({
      thread_id: r.conversation_id,
      title: "Conversation",
      last_active_at: (r.last_active_at ?? new Date()).toISOString(),
      preview: last?.content?.slice(0, 120) ?? null,
    });
  }
  return { ok: true, threads };
}

export async function listRelayMessages(args: {
  actor_entity_id: string;
  thread_id: string;
}): Promise<{ ok: true; messages: RelayMessageView[] } | RelayFailure> {
  const scope = await resolveScope(args.actor_entity_id);
  if ("ok" in scope) return scope;

  const owned = await prisma.otzarConversation.findFirst({
    where: {
      conversation_id: args.thread_id,
      org_entity_id: scope.org_entity_id,
      entity_id: scope.subject_entity_id,
      deleted_at: null,
    },
    select: { conversation_id: true },
  });
  if (owned === null) {
    return { ok: false, code: "NOT_FOUND", message: "Conversation not available." };
  }

  const threadScope = {
    org_entity_id: scope.org_entity_id,
    subject_entity_id: scope.subject_entity_id,
    twin_entity_id: scope.twin_entity_id,
  };
  const turns = await listConversationTurns(args.thread_id, threadScope, {
    limit: MAX_MESSAGES,
  });

  const messages: RelayMessageView[] = turns.map((t) => {
    const isYou = t.author_entity_id === args.actor_entity_id && t.role === "USER";
    const isTwin = t.role === "ASSISTANT";
    return {
      message_id: t.turn_id,
      thread_id: args.thread_id,
      body: t.content,
      author_label: isYou ? "YOU" : isTwin ? "SYSTEM" : "THEM",
      created_at: t.created_at.toISOString(),
      ai_involvement: isTwin ? "TWIN_DRAFT" : isYou ? "HUMAN" : "SYSTEM",
    };
  });

  return { ok: true, messages };
}
