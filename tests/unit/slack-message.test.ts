// FILE: slack-message.test.ts
// PURPOSE: [SLACK-INGEST-1] Pure-policy tests for the Slack message fetch
//          service — the ts-format fence and the DM/group-DM park policy
//          that run BEFORE any provider call. The full network path is
//          exercised at the route tier (admin-routes.test.ts refusal chain);
//          the live happy path requires a connected Slack workspace and is
//          founder-run.

import { describe, expect, it } from "vitest";
import {
  isValidSlackMessageTs,
  slackChannelIdAllowed,
  MAX_SLACK_MESSAGE_CHARS,
} from "@niov/api";

describe("[SLACK-INGEST-1] Slack message ts validation", () => {
  it("accepts the canonical Slack ts shape", () => {
    expect(isValidSlackMessageTs("1699900000.123456")).toBe(true);
    expect(isValidSlackMessageTs("1.1")).toBe(true);
  });

  it("refuses malformed / injection-shaped input", () => {
    expect(isValidSlackMessageTs("")).toBe(false);
    expect(isValidSlackMessageTs("not-a-ts")).toBe(false);
    expect(isValidSlackMessageTs("1699900000")).toBe(false); // no fraction
    expect(isValidSlackMessageTs("1699900000.123456&limit=999")).toBe(false);
    expect(isValidSlackMessageTs("../../etc/passwd")).toBe(false);
  });
});

describe("[SLACK-INGEST-1] channel policy — DMs are parked", () => {
  it("allows public-channel-shaped ids", () => {
    expect(slackChannelIdAllowed("C0123ABCD")).toBe(true);
  });

  it("refuses DM, group-DM, and malformed ids before any provider call", () => {
    expect(slackChannelIdAllowed("D0123ABCD")).toBe(false); // direct message
    expect(slackChannelIdAllowed("G0123ABCD")).toBe(false); // legacy group DM
    expect(slackChannelIdAllowed("U0123ABCD")).toBe(false); // a user id is not a channel
    expect(slackChannelIdAllowed("")).toBe(false);
    expect(slackChannelIdAllowed("C1&latest=9")).toBe(false);
  });
});

describe("[SLACK-INGEST-1] ingest guard", () => {
  it("message size cap protects the pipeline", () => {
    expect(MAX_SLACK_MESSAGE_CHARS).toBe(40_000);
  });
});
