import "react";

/**
 * Minimal JSX shim to silence "Property 'div' does not exist on type 'JSX.IntrinsicElements'"
 * in any file even if React's JSX types don’t load for some reason.
 *
 * This does not change runtime; it only helps TypeScript understand HTML tags.
 */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}
