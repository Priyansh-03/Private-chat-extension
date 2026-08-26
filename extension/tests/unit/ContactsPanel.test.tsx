import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactsPanel } from "../../src/popup/ContactsPanel";

// __USE_REAL_BACKEND__ etc. are build-time constants substituted by vitest.config.ts's `define`,
// mirroring esbuild.config.mjs — see src/lib/backendConfig.ts. Set to true there so the "pairing
// needs the real backend" branch doesn't short-circuit the component under test.

describe("ContactsPanel accept-invite flow", () => {
  it("shows the typed name for the newly added contact after a successful accept", async () => {
    const user = userEvent.setup();
    let contactsListCallCount = 0;

    const sendMessage = globalThis.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    sendMessage.mockImplementation(async (message: { type: string }) => {
      switch (message.type) {
        case "contacts:request-list":
          contactsListCallCount += 1;
          // First call (on open): no contacts yet. Second call (after accept): the new one,
          // exactly as the backend would return it — see backend/src/routes/pairing.py.
          return contactsListCallCount === 1
            ? []
            : [{ contactId: "friend-1", name: "TestFriend", publicKey: "friend-pubkey", status: "offline" }];
        case "contact:accept-invite":
          return { ok: true, contactId: "friend-1", name: "TestFriend" };
        default:
          return undefined;
      }
    });

    render(<ContactsPanel />);

    await user.click(screen.getByRole("button", { name: "Manage" }));
    await waitFor(() => expect(screen.getByText("No contacts yet.")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/Name for them/), "TestFriend");
    await user.type(screen.getByPlaceholderText("Invite code"), "abc12345");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(screen.getByText("TestFriend")).toBeInTheDocument());

    // The exact request the popup sent to background — this is the contract backendTransport.ts
    // and the backend both need to honor.
    expect(sendMessage).toHaveBeenCalledWith({
      type: "contact:accept-invite",
      code: "ABC12345",
      displayName: "TestFriend",
    });
  });

  it("shows an error message and does not clear the form when accept fails", async () => {
    const user = userEvent.setup();
    const sendMessage = globalThis.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    sendMessage.mockImplementation(async (message: { type: string }) => {
      switch (message.type) {
        case "contacts:request-list":
          return [];
        case "contact:accept-invite":
          return { ok: false, error: "That invite code doesn't exist or has already been used." };
        default:
          return undefined;
      }
    });

    render(<ContactsPanel />);
    await user.click(screen.getByRole("button", { name: "Manage" }));
    await waitFor(() => expect(screen.getByText("No contacts yet.")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("Invite code"), "DEADCODE");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(screen.getByText("That invite code doesn't exist or has already been used.")).toBeInTheDocument(),
    );
  });
});

describe("ContactsPanel disconnect flow", () => {
  it("removes a contact after confirming, sending its id to the background", async () => {
    const user = userEvent.setup();
    let contactsListCallCount = 0;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const sendMessage = globalThis.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    sendMessage.mockImplementation(async (message: { type: string; contactId?: string }) => {
      switch (message.type) {
        case "contacts:request-list":
          contactsListCallCount += 1;
          return contactsListCallCount === 1
            ? [{ contactId: "friend-1", name: "TestFriend", publicKey: "friend-pubkey", status: "offline" }]
            : [];
        case "contact:remove":
          return { ok: true };
        default:
          return undefined;
      }
    });

    render(<ContactsPanel />);
    await user.click(screen.getByRole("button", { name: "Manage" }));
    await waitFor(() => expect(screen.getByText("TestFriend")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith({ type: "contact:remove", contactId: "friend-1" });
    await waitFor(() => expect(screen.getByText("No contacts yet.")).toBeInTheDocument());

    confirmSpy.mockRestore();
  });

  it("does not send contact:remove when the confirm dialog is dismissed", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const sendMessage = globalThis.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    sendMessage.mockImplementation(async (message: { type: string }) => {
      switch (message.type) {
        case "contacts:request-list":
          return [{ contactId: "friend-1", name: "TestFriend", publicKey: "friend-pubkey", status: "offline" }];
        default:
          return undefined;
      }
    });

    render(<ContactsPanel />);
    await user.click(screen.getByRole("button", { name: "Manage" }));
    await waitFor(() => expect(screen.getByText("TestFriend")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "contact:remove" }));
    expect(screen.getByText("TestFriend")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("shows an error and keeps the contact listed when removal fails", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const sendMessage = globalThis.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    sendMessage.mockImplementation(async (message: { type: string }) => {
      switch (message.type) {
        case "contacts:request-list":
          return [{ contactId: "friend-1", name: "TestFriend", publicKey: "friend-pubkey", status: "offline" }];
        case "contact:remove":
          return { ok: false, error: "Couldn't reach the server — check your connection and try again." };
        default:
          return undefined;
      }
    });

    render(<ContactsPanel />);
    await user.click(screen.getByRole("button", { name: "Manage" }));
    await waitFor(() => expect(screen.getByText("TestFriend")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() =>
      expect(screen.getByText("Couldn't reach the server — check your connection and try again.")).toBeInTheDocument(),
    );
    expect(screen.getByText("TestFriend")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
