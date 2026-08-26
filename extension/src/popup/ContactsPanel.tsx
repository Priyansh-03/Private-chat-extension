import { useEffect, useState } from "react";
import { USE_REAL_BACKEND } from "../lib/backendConfig";
import { defaultContactName } from "../lib/types";
import type {
  AcceptInviteResponse,
  CreateInviteResponse,
  RemoteContactSnapshot,
  RemoveContactResponse,
} from "../lib/transportProtocol";

function formatExpiry(iso: string): string {
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  return minutes <= 1 ? "expires in under a minute" : `expires in ${minutes} min`;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="pcp-btn"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function ContactsPanel() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<RemoteContactSnapshot[]>([]);
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [acceptCode, setAcceptCode] = useState("");
  const [acceptName, setAcceptName] = useState("");
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [acceptBusy, setAcceptBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const refresh = () => {
    void (chrome.runtime.sendMessage({ type: "contacts:request-list" }) as Promise<RemoteContactSnapshot[]>).then(setContacts);
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const handleCreateInvite = () => {
    setInviteBusy(true);
    setInviteError(null);
    chrome.runtime
      .sendMessage({ type: "contact:create-invite" })
      .then((response: CreateInviteResponse) => {
        if (response.ok) setInvite({ code: response.code, expiresAt: response.expiresAt });
        else setInviteError(response.error);
      })
      .finally(() => setInviteBusy(false));
  };

  const handleRemove = (contactId: string, name: string) => {
    if (!confirm(`Disconnect ${name}? You'll need a new invite code to pair with them again.`)) return;
    setRemovingId(contactId);
    setRemoveError(null);
    chrome.runtime
      .sendMessage({ type: "contact:remove", contactId })
      .then((response: RemoveContactResponse) => {
        if (response.ok) refresh();
        else setRemoveError(response.error);
      })
      .finally(() => setRemovingId(null));
  };

  const handleAccept = () => {
    const code = acceptCode.trim().toUpperCase();
    const name = acceptName.trim();
    if (!code) return;
    setAcceptBusy(true);
    setAcceptError(null);
    chrome.runtime
      .sendMessage({ type: "contact:accept-invite", code, displayName: name })
      .then((response: AcceptInviteResponse) => {
        if (response.ok) {
          setAcceptCode("");
          setAcceptName("");
          refresh();
        } else {
          setAcceptError(response.error);
        }
      })
      .finally(() => setAcceptBusy(false));
  };

  return (
    <div className="pcp-row pcp-row--stack">
      <div className="pcp-row__top">
        <span>Contacts</span>
        <button type="button" className="pcp-btn" onClick={() => setOpen((prev) => !prev)}>
          {open ? "Done" : "Manage"}
        </button>
      </div>

      {open && !USE_REAL_BACKEND && (
        <p className="pcp-hint">Pairing needs the real backend build (USE_REAL_BACKEND) — not available in this build.</p>
      )}

      {open && USE_REAL_BACKEND && (
        <div className="pcp-editor">
          <div className="pcp-contacts__block">
            <span className="pcp-contacts__label">Invite someone</span>
            {invite ? (
              <>
                <code className="pcp-contacts__code">{invite.code}</code>
                <div className="pcp-editor__item">
                  <CopyButton value={invite.code} />
                  <span className="pcp-hint">{formatExpiry(invite.expiresAt)}</span>
                </div>
              </>
            ) : (
              <button type="button" className="pcp-btn" onClick={handleCreateInvite} disabled={inviteBusy}>
                {inviteBusy ? "Creating…" : "Create invite code"}
              </button>
            )}
            {inviteError && <p className="pcp-hint pcp-hint--error">{inviteError}</p>}
          </div>

          <div className="pcp-contacts__block">
            <span className="pcp-contacts__label">Have a code?</span>
            <div className="pcp-editor__item">
              <input
                value={acceptName}
                onChange={(event) => setAcceptName(event.target.value)}
                placeholder="Name for them (optional — rename anytime via ✎)"
                className="pcp-editor__input"
                maxLength={40}
              />
            </div>
            <div className="pcp-editor__item">
              <input
                value={acceptCode}
                onChange={(event) => setAcceptCode(event.target.value)}
                placeholder="Invite code"
                className="pcp-editor__input"
                maxLength={16}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleAccept();
                }}
              />
              <button type="button" className="pcp-btn" onClick={handleAccept} disabled={acceptBusy || !acceptCode.trim()}>
                {acceptBusy ? "Adding…" : "Add"}
              </button>
            </div>
            {acceptError && <p className="pcp-hint pcp-hint--error">{acceptError}</p>}
          </div>

          <div className="pcp-contacts__block">
            <span className="pcp-contacts__label">Paired ({contacts.length})</span>
            {contacts.length === 0 && <p className="pcp-hint">No contacts yet.</p>}
            {removeError && <p className="pcp-hint pcp-hint--error">{removeError}</p>}
            {contacts.map((contact) => {
              const name = contact.name || defaultContactName(contact.contactId);
              return (
                <div key={contact.contactId} className="pcp-contacts__contact">
                  <div className="pcp-row__top">
                    <span>
                      <span className={`pcp-contacts__dot pcp-contacts__dot--${contact.status}`} />
                      {name}
                    </span>
                    <div className="pcp-editor__item">
                      <CopyButton value={contact.publicKey} />
                      <button
                        type="button"
                        className="pcp-btn"
                        onClick={() => handleRemove(contact.contactId, name)}
                        disabled={removingId === contact.contactId}
                      >
                        {removingId === contact.contactId ? "Removing…" : "Disconnect"}
                      </button>
                    </div>
                  </div>
                  <code className="pcp-contacts__key pcp-contacts__key--small">{contact.publicKey}</code>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
