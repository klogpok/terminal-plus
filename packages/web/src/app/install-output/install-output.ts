import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { BackendService, type InstallTab } from '../backend/backend.service';
import { STRINGS } from '../strings';

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\][^\u0007]*(\u0007|\u001b\\)|\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b[@-_]/g;

/** Turns raw pty output into plain text: no ANSI sequences, `\r` progress lines collapsed. */
function plainText(output: string): string {
  return output
    .replace(ANSI, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.slice(line.lastIndexOf('\r') + 1).trimEnd())
    .join('\n')
    // ConPTY redraws the screen with cursor moves; as plain text that leaves runs of empty lines.
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * One `pnpm install` output tab. A minimal plain-text view; the terminal tabs of ticket 03 can
 * replace the `<pre>` with an xterm fed from the same `InstallTab.output`.
 */
@Component({
  selector: 'dp-install-output',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="install-output" [attr.data-install-repo-id]="tab().repoId" [class]="'install-output state-' + tab().state">
      <header class="install-header">
        <span class="install-title">{{ strings.install.title(repoName()) }}</span>
        <button type="button" class="close" [attr.aria-label]="strings.actions.dismiss" [title]="strings.actions.dismiss" (click)="backend.closeInstallTab(tab().repoId)">✕</button>
      </header>
      <pre class="install-log">{{ text() }}</pre>
      <div class="install-status">{{ status() }}</div>
    </section>
  `,
  styles: `
    :host { display: block; }
    .install-output { border: 1px solid var(--border); border-radius: 6px; background: var(--panel); overflow: hidden; }
    .install-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid var(--border); }
    .install-title { font-weight: 600; }
    .close { border: none; background: none; color: var(--muted); cursor: pointer; font-size: 14px; }
    .install-log { margin: 0; padding: 8px 10px; max-height: 50vh; overflow: auto; background: #0f172a; color: #e2e8f0; font: 12px/1.4 Consolas, monospace; white-space: pre-wrap; }
    .install-status { padding: 6px 10px; font-size: 13px; }
    .state-succeeded .install-status { color: #16a34a; }
    .state-failed .install-status { color: #dc2626; }
  `,
})
export class InstallOutput {
  readonly tab = input.required<InstallTab>();
  protected readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;

  protected readonly text = computed(() => plainText(this.tab().output));
  protected readonly repoName = computed(
    () => this.backend.repos().find((r) => r.id === this.tab().repoId)?.name ?? this.tab().repoId,
  );
  protected readonly status = computed(() => {
    const tab = this.tab();
    if (tab.state === 'running') return STRINGS.install.status.running;
    if (tab.state === 'succeeded') return STRINGS.install.status.succeeded;
    return STRINGS.install.status.failed(tab.exitCode ?? -1);
  });
}
