import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { BackendService } from '../backend/backend.service';
import { STRINGS, type UiErrorInfo } from '../strings';

/** A name clash after picking a folder: the user chooses another name for the same folder. */
interface NameClash {
  path: string;
  name: string;
}

/**
 * "Add Repo": the Server shows the folder picker (a browser cannot return a folder path).
 * When the folder name is already taken, asks for another name and retries with the same folder.
 */
@Component({
  selector: 'dp-add-repo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="add-repo"
      [title]="strings.repos.addHint"
      [attr.aria-label]="strings.repos.add"
      [disabled]="busy()"
      (click)="pick()"
    >
      + {{ strings.repos.add }}
    </button>
    @if (clash(); as c) {
      <form class="repo-name-form" (submit)="$event.preventDefault(); retry(c)">
        <label>
          <span>{{ strings.repos.nameTaken(c.name) }}</span>
          <input
            type="text"
            [attr.aria-label]="strings.repos.nameLabel"
            [value]="newName()"
            (input)="newName.set($any($event.target).value)"
          />
        </label>
        <span class="form-actions">
          <button type="submit" [disabled]="busy() || !newName().trim()">{{ strings.repos.addConfirm }}</button>
          <button type="button" (click)="clash.set(undefined)">{{ strings.repos.cancel }}</button>
        </span>
      </form>
    }
  `,
  styles: `
    :host { display: block; margin-bottom: 10px; }
    .add-repo { width: 100%; padding: 6px; border: 1px dashed var(--border); border-radius: 6px; background: transparent; color: var(--fg); cursor: pointer; }
    .add-repo:not(:disabled):hover { border-color: var(--accent); }
    .repo-name-form { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
    .repo-name-form label { display: flex; flex-direction: column; gap: 4px; }
    .repo-name-form input { padding: 4px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); }
    .form-actions { display: flex; gap: 6px; }
  `,
})
export class AddRepo {
  private readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;
  protected readonly busy = signal(false);
  protected readonly clash = signal<NameClash | undefined>(undefined);
  protected readonly newName = signal('');

  protected pick(): void {
    this.clash.set(undefined);
    void this.add({});
  }

  protected retry(clash: NameClash): void {
    const name = this.newName().trim();
    if (name) void this.add({ path: clash.path, name });
  }

  private async add(options: { path?: string; name?: string }): Promise<void> {
    this.busy.set(true);
    try {
      await this.backend.addRepo(options);
      this.clash.set(undefined);
    } catch (e) {
      const error = e as UiErrorInfo;
      if (error.code === 'repoNameTaken') {
        this.clash.set({ path: error.params.path, name: error.params.name });
        this.newName.set(`${error.params.name} 2`);
      } else {
        this.clash.set(undefined);
        this.backend.showError(error);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
