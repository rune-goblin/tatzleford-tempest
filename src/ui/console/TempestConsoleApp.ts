import { mount, unmount } from 'svelte';
import { CONSOLE_ID, MODULE_ID } from '../../constants';
import TempestConsole from './TempestConsole.svelte';
import { consoleState } from './state.svelte';

const { ApplicationV2 } = foundry.applications.api;

export class TempestConsoleApp extends ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: CONSOLE_ID,
    tag: 'section',
    classes: [MODULE_ID],
    window: { title: `${MODULE_ID}.console.title`, icon: 'fa-solid fa-cloud-bolt', resizable: true },
    position: { width: 460, height: 'auto' as const },
  };

  static #instance?: TempestConsoleApp;

  #component?: ReturnType<typeof mount>;
  #root?: HTMLElement;
  #unsubscribe?: () => void;

  /** One window per world: reopening brings the existing one forward with its state intact. */
  static open(): TempestConsoleApp {
    TempestConsoleApp.#instance ??= new TempestConsoleApp();
    const app = TempestConsoleApp.#instance;
    void app.render({ force: true });
    return app;
  }

  // AppV2 runs _renderHTML on every render; mount once and reuse the node, so a re-render neither
  // leaks a second component (the first is never unmounted) nor discards Svelte's reactive state.
  protected override async _renderHTML(): Promise<HTMLElement> {
    if (!this.#component) {
      this.#root = document.createElement('div');
      this.#unsubscribe = consoleState.subscribe();
      this.#component = mount(TempestConsole, { target: this.#root });
    }
    return this.#root!;
  }

  protected override _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  protected override async _preClose(): Promise<void> {
    consoleState.cancelPlacement();
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    if (this.#component) {
      unmount(this.#component);
      this.#component = undefined;
      this.#root = undefined;
    }
    TempestConsoleApp.#instance = undefined;
  }
}
