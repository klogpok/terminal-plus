import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BackendService } from './backend/backend.service';
import { ErrorMessage } from './error-message/error-message';
import { InstallOutput } from './install-output/install-output';
import { RepoList } from './repo-list/repo-list';
import { STRINGS } from './strings';

@Component({
  selector: 'dp-root',
  imports: [RepoList, ErrorMessage, InstallOutput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;
}
