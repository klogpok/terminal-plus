import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { RepoWorktrees } from '@devpanel/shared';
import { App } from './app';
import { BACKEND_TRANSPORT } from './backend/backend-transport';
import { FakeTransport } from './backend/fake-transport';
import { aRepo, aService } from './backend/test-data';

let transport: FakeTransport;
let fixture: ComponentFixture<App>;
let page: HTMLElement;

beforeEach(async () => {
  transport = new FakeTransport();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [{ provide: BACKEND_TRANSPORT, useValue: transport }],
  });
  fixture = TestBed.createComponent(App);
  page = fixture.nativeElement as HTMLElement;
  await fixture.whenStable();
});

function buttonIn(root: ParentNode, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === text || b.textContent?.trim() === text,
  );
  if (!found) throw new Error(`No button "${text}" in:\n${(root as HTMLElement).innerHTML ?? ''}`);
  return found;
}

function topbar(): HTMLElement {
  return page.querySelector<HTMLElement>('.topbar')!;
}

function panel(): HTMLElement | null {
  return page.querySelector<HTMLElement>('[role=dialog][aria-label=Branches]');
}

function repoCard(repoId: string): HTMLElement {
  return page.querySelector<HTMLElement>(`[data-repo-id="${repoId}"]`)!;
}

function errorsText(): string {
  return page.querySelector('.errors')?.textContent ?? '';
}

function text(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

const client = aRepo({
  id: 'c1',
  name: 'client',
  branch: 'main',
  services: [aService({ id: 'web', name: 'web', status: 'running' })],
});
const backend = aRepo({ id: 'b1', name: 'backend', branch: 'feat/x' });
const server = aRepo({ id: 's1', name: 'server', branch: 'master' });

const found: RepoWorktrees[] = [
  {
    repoId: 'c1',
    branch: 'main',
    worktrees: [
      { path: 'C:\\wt\\client\\y', branch: 'feat/y' },
      { path: 'C:\\wt\\client\\x', branch: 'feat/x' },
    ],
  },
  { repoId: 'b1', branch: 'feat/x', worktrees: [] },
  { repoId: 's1', branch: 'master', worktrees: [] },
];

async function openPanel(): Promise<void> {
  buttonIn(topbar(), 'Branches').click();
  await fixture.whenStable();
  await transport.reply(transport.lastCommand('listWorktrees'), found);
  await fixture.whenStable();
}

describe('Branches panel', () => {
  it('reads the Worktrees when it opens and shows one row per branch with its Repos', async () => {
    await transport.connectWith({ repos: [client, backend, server] });
    await fixture.whenStable();

    buttonIn(topbar(), 'Branches').click();
    await fixture.whenStable();
    expect(text(panel())).toContain('Looking for Worktrees…');

    await transport.reply(transport.lastCommand('listWorktrees'), found);
    await fixture.whenStable();

    const rows = [...panel()!.querySelectorAll('[data-branch]')].map((row) => [
      row.getAttribute('data-branch'),
      [...row.querySelectorAll('.chip')].map((chip) => text(chip)),
    ]);
    expect(rows).toEqual([
      ['feat/x', ['client', 'backend · Repo folder']],
      ['feat/y', ['client']],
    ]);
  });

  it('puts the branches a Repo runs on first and marks those Repos', async () => {
    const onY = { ...client, worktree: { path: 'C:\\wt\\client\\y', branch: 'feat/y' } };
    await transport.connectWith({ repos: [onY, server] });
    await fixture.whenStable();
    await openPanel();

    const rows = [...panel()!.querySelectorAll('[data-branch]')].map((row) => [
      row.getAttribute('data-branch'),
      [...row.querySelectorAll('.chip.here')].map((chip) => text(chip)),
    ]);
    expect(rows).toEqual([
      ['feat/y', ['client']],
      ['feat/x', []],
    ]);
  });

  it('filters the rows by branch or Repo, and Enter checks the first one left', async () => {
    await transport.connectWith({ repos: [client, backend, server] });
    await fixture.whenStable();
    await openPanel();
    const filter = panel()!.querySelector<HTMLInputElement>('input[type=search]')!;
    const shown = () => [...panel()!.querySelectorAll('[data-branch]')].map((row) => row.getAttribute('data-branch'));
    const type = async (value: string) => {
      filter.value = value;
      filter.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };

    await type('Y');
    expect(shown()).toEqual(['feat/y']);
    await type('backend');
    expect(shown()).toEqual(['feat/x']);
    await type('nope');
    expect(shown()).toEqual([]);
    expect(text(panel())).toContain('No branch matches "nope"');

    await type('y');
    filter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();

    expect(transport.lastCommand('startBranchCheck').payload).toEqual({ branch: 'feat/y' });
    expect(panel()).toBeNull();
  });

  it('says so when no Repo has a Worktree', async () => {
    await transport.connectWith({ repos: [server] });
    await fixture.whenStable();

    buttonIn(topbar(), 'Branches').click();
    await fixture.whenStable();
    await transport.reply(transport.lastCommand('listWorktrees'), [{ repoId: 's1', branch: 'master', worktrees: [] }]);
    await fixture.whenStable();

    expect(text(panel())).toContain('No Worktrees found.');
  });

  it('Check starts a Branch Check, closes the panel and shows progress until it finishes', async () => {
    await transport.connectWith({ repos: [client, backend, server] });
    await fixture.whenStable();
    await openPanel();

    buttonIn(panel()!, 'Check branch feat/x').click();
    await fixture.whenStable();

    const command = transport.lastCommand('startBranchCheck');
    expect(command.payload).toEqual({ branch: 'feat/x' });
    expect(panel()).toBeNull();
    expect(text(topbar())).toContain('Switching…');

    transport.emit('branchCheckChanged', { branch: 'feat/x' });
    await transport.reply(command, { notFound: [], notRunning: [] });
    await fixture.whenStable();

    expect(text(topbar())).not.toContain('Switching…');
    const checking = topbar().querySelector('[data-branch-check]')!;
    expect(text(checking)).toContain('Checking ⎇ feat/x');
    expect(buttonIn(checking, 'Back to main').disabled).toBe(false);
    expect(errorsText()).toBe('');
  });

  it('names the Services that did not come back up', async () => {
    await transport.connectWith({ repos: [client, backend] });
    await fixture.whenStable();
    await openPanel();
    buttonIn(panel()!, 'Check branch feat/x').click();
    await fixture.whenStable();

    await transport.reply(transport.lastCommand('startBranchCheck'), {
      notFound: [{ ref: { repoId: 'b1', serviceId: 'mock' }, repoName: 'backend', serviceName: 'mock' }],
      notRunning: [{ ref: { repoId: 'c1', serviceId: 'web' }, repoName: 'client', serviceName: 'web' }],
    });
    await fixture.whenStable();

    expect(errorsText()).toContain(
      'After the switch, not everything came back up. Not running: web in Repo client. ' +
        'The list of Services shows why; a taken port offers its choice there. ' +
        'Not in the config of the new folder: mock in Repo backend.',
    );
  });

  it('shows a refusal from the Server', async () => {
    await transport.connectWith({ repos: [client] });
    await fixture.whenStable();
    await openPanel();
    buttonIn(panel()!, 'Check branch feat/y').click();
    await fixture.whenStable();

    await transport.fail(transport.lastCommand('startBranchCheck'), {
      code: 'branchNotFound',
      params: { branch: 'feat/y' },
      details: 'No Repo has a Worktree on branch "feat/y"',
    });
    await fixture.whenStable();

    expect(errorsText()).toContain('No Repo has the branch feat/y any more.');
  });

  it('shows the Branch Check from the snapshot, marks its row, and "Back to main" ends it', async () => {
    await transport.connectWith({ repos: [client, backend], branchCheck: 'feat/x' });
    await fixture.whenStable();
    expect(text(topbar().querySelector('[data-branch-check]'))).toContain('feat/x');

    await openPanel();
    const row = panel()!.querySelector('[data-branch="feat/x"]')!;
    expect(row.classList).toContain('active');
    buttonIn(row, 'Back to main').click();
    await fixture.whenStable();

    expect(transport.lastCommand('endBranchCheck').payload).toEqual({});

    transport.emit('branchCheckChanged', {});
    await fixture.whenStable();
    expect(topbar().querySelector('[data-branch-check]')).toBeNull();
  });
});

describe('Folder switcher', () => {
  const onWorktree = { ...client, worktree: { path: 'C:\\wt\\client\\x', branch: 'feat/x' } };

  async function openSwitcher(): Promise<HTMLElement> {
    buttonIn(repoCard('c1'), 'Choose the folder client runs from').click();
    await fixture.whenStable();
    await transport.reply(transport.lastCommand('listWorktrees'), found);
    await fixture.whenStable();
    return repoCard('c1').querySelector<HTMLElement>('[role=menu]')!;
  }

  function options(menu: HTMLElement): [string | null, string, string | null][] {
    return [...menu.querySelectorAll('[role=menuitemradio]')].map((o) => [
      o.getAttribute('data-folder'),
      text(o.querySelector('.title')),
      o.getAttribute('aria-checked'),
    ]);
  }

  it('lists the Repo folder and its Worktrees; choosing a Worktree switches to it', async () => {
    await transport.connectWith({ repos: [client] });
    await fixture.whenStable();

    const menu = await openSwitcher();

    expect(options(menu)).toEqual([
      ['C:\\code\\c1', 'Repo folder · main', 'true'],
      ['C:\\wt\\client\\y', 'feat/y', 'false'],
      ['C:\\wt\\client\\x', 'feat/x', 'false'],
    ]);
    (menu.querySelector('[data-folder="C:\\\\wt\\\\client\\\\x"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(transport.lastCommand('switchRepoFolder').payload).toEqual({ repoId: 'c1', worktreePath: 'C:\\wt\\client\\x' });
    expect(repoCard('c1').querySelector('[role=menu]')).toBeNull();
  });

  it('shows the Worktree branch with a mark, and switches back to the Repo folder', async () => {
    await transport.connectWith({ repos: [onWorktree] });
    await fixture.whenStable();
    expect(text(repoCard('c1').querySelector('.repo-branch'))).toContain('feat/x');
    expect(text(repoCard('c1').querySelector('.worktree-mark'))).toBe('Worktree');

    const menu = await openSwitcher();
    expect(options(menu).map(([, , checked]) => checked)).toEqual(['false', 'false', 'true']);
    (menu.querySelector('[data-folder="C:\\\\code\\\\c1"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(transport.lastCommand('switchRepoFolder').payload).toEqual({ repoId: 'c1', worktreePath: null });

    transport.emit('configChanged', { repo: client });
    await fixture.whenStable();
    expect(repoCard('c1').querySelector('.worktree-mark')).toBeNull();
    expect(text(repoCard('c1').querySelector('.repo-branch'))).toContain('main');
  });

  it('choosing the folder it already runs from sends nothing', async () => {
    await transport.connectWith({ repos: [client] });
    await fixture.whenStable();

    const menu = await openSwitcher();
    (menu.querySelector('[aria-checked=true]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(transport.commands('switchRepoFolder')).toEqual([]);
  });
});
