import { Component, type ReactNode } from "react";

interface EmojiPickerBoundaryState {
  hasError: boolean;
}

/** @emoji-mart/react renders a web component; on some host pages its construction throws at
 * render time (e.g. "Illegal constructor", seen when the picker opens on reviewit.co.in) rather
 * than at the bundle-eval-time failure esbuild.config.mjs's banner already guards against. Without
 * this, that uncaught error unmounts the whole content-script React tree — FAB included, not just
 * the picker — exactly what that banner's own comment already warned this library can do. */
export class EmojiPickerBoundary extends Component<{ children: ReactNode }, EmojiPickerBoundaryState> {
  state: EmojiPickerBoundaryState = { hasError: false };

  static getDerivedStateFromError(): EmojiPickerBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <p className="pco-emoji-error">Emoji picker isn&apos;t available on this page.</p>;
    }
    return this.props.children;
  }
}
