"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Callout, Dialog, SegmentedControl, Text, TextField } from "frosted-ui";
import { nudgeBudgetFetchInit, useNudgeBudget } from "@/context/nudge-budget-context";

type Member = {
  whop_user_id: string;
  role: string;
  display_name: string | null;
  color: string | null;
  joined_at: string | null;
};

type InviteRow = {
  id: string;
  workbookId: string;
  inviterUserId: string;
  code: string | null;
  inviteeUsername: string | null;
  inviteeUserId: string | null;
  status: string;
};

type AcceptMode = "adopt" | "fresh";

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function CopyButton(props: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="soft"
      color="gray"
      size="2"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(props.value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function MembersList(props: { members: Member[]; currentUserId: string }) {
  return (
    <div className="flex flex-col gap-2">
      {props.members.map((m) => {
        const label = m.display_name?.trim() || shortId(m.whop_user_id);
        const isYou = m.whop_user_id === props.currentUserId;
        const isOwner = m.role === "owner";
        return (
          <div
            key={m.whop_user_id}
            className="flex items-center justify-between gap-4 rounded-xl border border-gray-600/15 bg-gray-900/3 px-3 py-2.5 dark:bg-white/4"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: m.color || "var(--gold)" }}
              />
              <Text size="2" weight="medium" className="truncate">
                {label}
              </Text>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {isYou ? (
                <Badge color="gold" variant="soft">
                  You
                </Badge>
              ) : null}
              {isOwner ? (
                <Badge color="gray" variant="soft">
                  Owner
                </Badge>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SharingDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { whopUserToken, currentUserId } = useNudgeBudget();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [incoming, setIncoming] = useState<InviteRow[]>([]);
  const [outgoing, setOutgoing] = useState<InviteRow[]>([]);

  // Invite form state
  const [mode, setMode] = useState<"username" | "code">("username");
  const [username, setUsername] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentInvite, setSentInvite] = useState<InviteRow | null>(null);

  // Per-incoming-invite chosen mode
  const [acceptMode, setAcceptMode] = useState<Record<string, AcceptMode>>({});
  const [busyInvite, setBusyInvite] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const authedFetch = useCallback(
    (url: string, init?: RequestInit) =>
      fetch(url, nudgeBudgetFetchInit(whopUserToken, { credentials: "include", ...init })),
    [whopUserToken],
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [invitesRes, membersRes] = await Promise.all([
        authedFetch("/api/invites"),
        authedFetch("/api/members"),
      ]);
      const invitesJson = (await invitesRes.json().catch(() => ({}))) as {
        incoming?: InviteRow[];
        outgoing?: InviteRow[];
        error?: string;
      };
      const membersJson = (await membersRes.json().catch(() => ({}))) as {
        members?: Member[];
        error?: string;
      };
      if (!invitesRes.ok) throw new Error(invitesJson.error || "Could not load invites.");
      if (!membersRes.ok) throw new Error(membersJson.error || "Could not load members.");
      setIncoming(invitesJson.incoming ?? []);
      setOutgoing(invitesJson.outgoing ?? []);
      setMembers(membersJson.members ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load sharing details.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    if (!props.open) return;
    // Reset transient form state each open.
    setFormError(null);
    setActionError(null);
    setSentInvite(null);
    setUsername("");
    setMode("username");
    void refetch();
  }, [props.open, refetch]);

  async function sendInvite() {
    setSending(true);
    setFormError(null);
    setSentInvite(null);
    try {
      const body =
        mode === "username"
          ? { method: "username", username: username.trim() }
          : { method: "code" };
      if (mode === "username" && !username.trim()) {
        setFormError("Enter a username.");
        return;
      }
      const res = await authedFetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { invite?: InviteRow; error?: string };
      if (!res.ok || !json.invite) {
        setFormError(json.error || "Could not create invite.");
        return;
      }
      setSentInvite(json.invite);
      await refetch();
    } catch {
      setFormError("Could not create invite.");
    } finally {
      setSending(false);
    }
  }

  async function revokeInvite(inviteId: string) {
    setBusyInvite(inviteId);
    setActionError(null);
    try {
      const res = await authedFetch("/api/invites/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId, action: "revoke" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setActionError(json.error || "Could not revoke invite.");
        return;
      }
      setSentInvite(null);
      await refetch();
    } catch {
      setActionError("Could not revoke invite.");
    } finally {
      setBusyInvite(null);
    }
  }

  async function acceptInvite(inviteId: string) {
    setBusyInvite(inviteId);
    setActionError(null);
    try {
      const chosen = acceptMode[inviteId] ?? "adopt";
      const res = await authedFetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId, mode: chosen }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setActionError(json.error || "Could not accept invite.");
        return;
      }
      // Membership-scoped data must reload.
      window.location.reload();
    } catch {
      setActionError("Could not accept invite.");
    } finally {
      setBusyInvite(null);
    }
  }

  async function declineInvite(inviteId: string) {
    setBusyInvite(inviteId);
    setActionError(null);
    try {
      const res = await authedFetch("/api/invites/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId, action: "decline" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setActionError(json.error || "Could not decline invite.");
        return;
      }
      await refetch();
    } catch {
      setActionError("Could not decline invite.");
    } finally {
      setBusyInvite(null);
    }
  }

  const hasOutgoing = outgoing.length > 0;
  const showInviteForm = members.length < 2 && !hasOutgoing;

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Content
        size="3"
        className="max-h-[calc(100dvh-2rem)] max-w-[min(calc(100vw-1.5rem),24rem)] overflow-y-auto overscroll-contain sm:max-w-md"
      >
        <Dialog.Title>Share budget</Dialog.Title>
        <Dialog.Description size="2" color="gray" className="leading-relaxed">
          Invite one other person to share this budget. Members see and edit the same ledger.
        </Dialog.Description>

        <div className="mt-6 flex flex-col gap-7">
          {loadError ? (
            <Callout.Root color="red" size="1">
              <Callout.Text>{loadError}</Callout.Text>
            </Callout.Root>
          ) : null}

          {loading ? (
            <Text size="2" color="gray">
              Loading…
            </Text>
          ) : (
            <>
              {/* Members */}
              <section className="flex flex-col gap-3">
                <Text size="2" weight="medium" className="block text-foreground/80">
                  Members
                </Text>
                {members.length > 0 ? (
                  <MembersList members={members} currentUserId={currentUserId} />
                ) : (
                  <Text size="2" color="gray">
                    No members yet.
                  </Text>
                )}
              </section>

              {/* Incoming invites */}
              {incoming.length > 0 ? (
                <section className="flex flex-col gap-3">
                  <Text size="2" weight="medium" className="block text-foreground/80">
                    Invitations for you
                  </Text>
                  {actionError ? (
                    <Callout.Root color="red" size="1">
                      <Callout.Text>{actionError}</Callout.Text>
                    </Callout.Root>
                  ) : null}
                  {incoming.map((inv) => {
                    const who = inv.inviterUserId ? shortId(inv.inviterUserId) : "Someone";
                    const chosen = acceptMode[inv.id] ?? "adopt";
                    const busy = busyInvite === inv.id;
                    return (
                      <div
                        key={inv.id}
                        className="flex flex-col gap-3 rounded-xl border border-gray-600/15 bg-gray-900/3 p-4 dark:bg-white/4"
                      >
                        <Text size="2" className="leading-relaxed">
                          @{who} invited you to share a budget.
                        </Text>
                        <SegmentedControl.Root
                          value={chosen}
                          onValueChange={(v) =>
                            setAcceptMode((s) => ({ ...s, [inv.id]: v as AcceptMode }))
                          }
                        >
                          <SegmentedControl.List>
                            <SegmentedControl.Trigger value="adopt">
                              Use their budget
                            </SegmentedControl.Trigger>
                            <SegmentedControl.Trigger value="fresh">
                              Start fresh
                            </SegmentedControl.Trigger>
                          </SegmentedControl.List>
                        </SegmentedControl.Root>
                        <Text size="1" color="gray" className="leading-snug">
                          {chosen === "adopt"
                            ? "Join and keep their existing budget data."
                            : "Join with a clean slate — their data is not copied."}
                        </Text>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                          <Button
                            type="button"
                            variant="soft"
                            color="red"
                            size="2"
                            disabled={busy}
                            className="w-full sm:w-auto"
                            onClick={() => void declineInvite(inv.id)}
                          >
                            Decline
                          </Button>
                          <Button
                            type="button"
                            size="2"
                            color="gold"
                            disabled={busy}
                            className="w-full shadow-sm sm:w-auto"
                            onClick={() => void acceptInvite(inv.id)}
                          >
                            {busy ? "Joining…" : "Accept"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </section>
              ) : null}

              {/* Pending outgoing invite */}
              {hasOutgoing ? (
                <section className="flex flex-col gap-3">
                  <Text size="2" weight="medium" className="block text-foreground/80">
                    Pending invite
                  </Text>
                  {actionError ? (
                    <Callout.Root color="red" size="1">
                      <Callout.Text>{actionError}</Callout.Text>
                    </Callout.Root>
                  ) : null}
                  {outgoing.map((inv) => {
                    const busy = busyInvite === inv.id;
                    return (
                      <div
                        key={inv.id}
                        className="flex flex-col gap-3 rounded-xl border border-gray-600/15 bg-gray-900/3 p-4 dark:bg-white/4"
                      >
                        {inv.inviteeUsername ? (
                          <Text size="2" color="gray">
                            Invited @{inv.inviteeUsername}
                          </Text>
                        ) : null}
                        <div className="flex items-center justify-between gap-3">
                          <Text
                            size="4"
                            weight="bold"
                            className="font-mono tracking-widest tabular-nums"
                          >
                            {inv.code}
                          </Text>
                          <CopyButton value={inv.code ?? ""} />
                        </div>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                          <Button
                            type="button"
                            variant="soft"
                            color="red"
                            size="2"
                            disabled={busy}
                            className="w-full sm:w-auto"
                            onClick={() => void revokeInvite(inv.id)}
                          >
                            {busy ? "Revoking…" : "Revoke"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </section>
              ) : null}

              {/* Invite form */}
              {showInviteForm ? (
                <section className="flex flex-col gap-3">
                  <Text size="2" weight="medium" className="block text-foreground/80">
                    Invite someone
                  </Text>
                  <SegmentedControl.Root
                    value={mode}
                    onValueChange={(v) => {
                      setMode(v as "username" | "code");
                      setFormError(null);
                      setSentInvite(null);
                    }}
                  >
                    <SegmentedControl.List>
                      <SegmentedControl.Trigger value="username">
                        By username
                      </SegmentedControl.Trigger>
                      <SegmentedControl.Trigger value="code">By code</SegmentedControl.Trigger>
                    </SegmentedControl.List>
                  </SegmentedControl.Root>

                  {formError ? (
                    <Callout.Root color="red" size="1">
                      <Callout.Text>{formError}</Callout.Text>
                    </Callout.Root>
                  ) : null}

                  {mode === "username" ? (
                    <form
                      className="flex flex-col gap-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void sendInvite();
                      }}
                    >
                      <TextField.Root className="nudge-field w-full">
                        <TextField.Input
                          placeholder="@username"
                          autoComplete="off"
                          value={username}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setUsername(e.target.value)
                          }
                        />
                      </TextField.Root>
                      <Button
                        type="submit"
                        size="3"
                        color="gold"
                        disabled={sending}
                        className="w-full shadow-sm sm:w-auto sm:self-end"
                      >
                        {sending ? "Sending…" : "Send invite"}
                      </Button>
                    </form>
                  ) : (
                    <Button
                      type="button"
                      size="3"
                      color="gold"
                      disabled={sending}
                      className="w-full shadow-sm sm:w-auto sm:self-end"
                      onClick={() => void sendInvite()}
                    >
                      {sending ? "Generating…" : "Generate code"}
                    </Button>
                  )}

                  {sentInvite ? (
                    <div className="flex flex-col gap-2 rounded-xl border border-gray-600/15 bg-gray-900/3 p-4 dark:bg-white/4">
                      <Text size="1" color="gray">
                        {mode === "username"
                          ? "Invite sent. Share this code as a fallback:"
                          : "Share this code:"}
                      </Text>
                      <div className="flex items-center justify-between gap-3">
                        <Text
                          size="4"
                          weight="bold"
                          className="font-mono tracking-widest tabular-nums"
                        >
                          {sentInvite.code}
                        </Text>
                        <CopyButton value={sentInvite.code ?? ""} />
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          )}
        </div>

        <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Dialog.Close>
            <Button type="button" variant="soft" color="gray" size="3" className="w-full sm:w-auto">
              Close
            </Button>
          </Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
