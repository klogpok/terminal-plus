import { CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { RepoView } from '@devpanel/shared';
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

async function stable(): Promise<void> {
  await fixture.whenStable();
}

function repoNames(): string[] {
  return [...page.querySelectorAll('[data-repo-id] .repo-name')].map((e) => e.textContent!.trim());
}

/** Plays a finished drag of the card at `from` onto position `to`, as CDK reports it. */
async function drop(from: number, to: number): Promise<void> {
  const list = fixture.debugElement.query(By.directive(CdkDropList)).injector.get(CdkDropList);
  list.dropped.emit({ previousIndex: from, currentIndex: to } as CdkDragDrop<RepoView[]>);
  await stable();
}

const alpha = aRepo({ id: 'a1', name: 'Alpha', color: '#ef4444' });
const beta = aRepo({ id: 'b1', name: 'Beta', services: [aService({ id: 'api', status: 'running' })] });
const gamma = aRepo({ id: 'g1', name: 'Gamma', folderMissing: true });

describe('reordering Repos', () => {
  it('moves the card at once and asks the Server to store the new order', async () => {
    await transport.connectWith({ repos: [alpha, beta, gamma] });
    await stable();

    await drop(2, 0);

    expect(repoNames()).toEqual(['Gamma', 'Alpha', 'Beta']);
    const command = transport.lastCommand('moveRepo');
    expect(command.payload).toEqual({ repoId: 'g1', toIndex: 0 });
    await transport.reply(command, null);
    await stable();
    expect(repoNames()).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(page.querySelector('.error')).toBeNull();
  });

  it('sends nothing when the card is dropped where it was', async () => {
    await transport.connectWith({ repos: [alpha, beta] });
    await stable();

    await drop(1, 1);

    expect(transport.commands('moveRepo')).toEqual([]);
    expect(repoNames()).toEqual(['Alpha', 'Beta']);
  });

  it('restores the previous order and shows the error when the move fails', async () => {
    await transport.connectWith({ repos: [alpha, beta, gamma] });
    await stable();

    await drop(0, 2);
    expect(repoNames()).toEqual(['Beta', 'Gamma', 'Alpha']);
    // State changes that arrive meanwhile are kept.
    transport.emit('statusChanged', { repoId: 'b1', serviceId: 'api', status: 'stopped' });
    await transport.fail(transport.lastCommand('moveRepo'), {
      code: 'repoNotFound',
      params: { repoId: 'a1' },
      details: 'Unknown Repo "a1"',
    });
    await stable();

    expect(repoNames()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(page.querySelector('.error')?.textContent).toContain('This Repo is no longer in the list');
    expect(page.querySelector('[data-repo-id="b1"] .status-dot')?.classList).toContain('status-stopped');
  });

  it('keeps an order the Server sent meanwhile when the move fails', async () => {
    await transport.connectWith({ repos: [alpha, beta, gamma] });
    await stable();

    await drop(0, 2);
    transport.emit('reposReordered', { repoIds: ['b1', 'a1', 'g1'] });
    await transport.fail(transport.lastCommand('moveRepo'), {
      code: 'repoNotFound',
      params: { repoId: 'a1' },
      details: 'Unknown Repo "a1"',
    });
    await stable();

    expect(repoNames()).toEqual(['Beta', 'Alpha', 'Gamma']);
    expect(page.querySelector('.error')).not.toBeNull();
  });

  it('follows reposReordered from the Server, ignoring unknown ids and keeping unlisted Repos at the end', async () => {
    await transport.connectWith({ repos: [alpha, beta, gamma] });
    await stable();

    transport.emit('reposReordered', { repoIds: ['g1', 'x9', 'a1'] });
    await stable();

    expect(repoNames()).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('still adds a new Repo at the bottom', async () => {
    await transport.connectWith({ repos: [alpha, beta] });
    await stable();
    await drop(1, 0);

    transport.emit('repoChanged', { repoId: 'n1', repo: aRepo({ id: 'n1', name: 'New' }) });
    await stable();

    expect(repoNames()).toEqual(['Beta', 'Alpha', 'New']);
  });

  it('gives every card a drag handle with a tooltip and an accessible name', async () => {
    await transport.connectWith({ repos: [alpha, gamma] });
    await stable();

    for (const name of ['Alpha', 'Gamma']) {
      const handle = page.querySelector<HTMLElement>(`[aria-label="Move Repo ${name}"]`);
      expect(handle?.classList).toContain('cdk-drag-handle');
      expect(handle?.title).toBe('Drag to reorder');
    }
  });
});
