import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BackendService } from './backend/backend.service';
import { ErrorMessage } from './error-message/error-message';
import { RepoList } from './repo-list/repo-list';
import { TerminalTabStrip } from './terminal/terminal-tab-strip';
import { STRINGS } from './strings';

@Component({
  selector: 'dp-root',
  imports: [RepoList, ErrorMessage, TerminalTabStrip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;
}
