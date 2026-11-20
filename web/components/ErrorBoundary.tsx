"use client";

// The net under the render tree.
//
// `AtlasApp` is one client component holding the whole run — the graph, every
// mastery state, every generated cache, none of it written to Postgres more
// often than the debounce allows. Before this, a throw anywhere inside it took
// all of that with it. Wrapping each session sheet means a view that breaks
// costs the learner that view and nothing else.
//
// A class is not a style choice: `componentDidCatch` has no hook equivalent,
// in React 19 or otherwise.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Rendered in place of the subtree. `reset` clears the caught error. */
  fallback: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  /**
   * Clear the caught error when any of these change — leaving a broken session
   * and opening another one should not require a reload. Compared by identity,
   * positionally, so keep the array a stable length.
   */
  resetKeys?: readonly unknown[];
}

interface State {
  error: Error | null;
  /** The `resetKeys` the current error was caught under. */
  keys: readonly unknown[];
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, keys: [] };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    const next = props.resetKeys ?? [];
    if (!state.error) return { keys: next };
    const changed =
      next.length !== state.keys.length ||
      next.some((key, i) => !Object.is(key, state.keys[i]));
    return changed ? { error: null, keys: next } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private reset = (): void => {
    this.setState({ error: null, keys: this.props.resetKeys ?? [] });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) return this.props.fallback(error, this.reset);
    return this.props.children;
  }
}
