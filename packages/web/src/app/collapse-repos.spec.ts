import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { App } from './app';
import { BACKEND_TRANSPORT } from './backend/backend-transport';
import { FakeTransport } from './backend/fake-transport';
import { aRepo, aService } from './backend/test-data';

let transport: FakeTransport;
let fixture: ComponentFixture<App>;
let page: HTMLElement;

async function createApp(): Promise<void> {
  transport = new FakeTransport();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [{ provide: BACKEND_TRANSPORT, useValue: transport }],
  });
  fixture = TestBed.createComponent(App);
  page = fixture.nativeElement as HTMLElement;
  await fixture.whenStable();
}

beforeEach(async () => {
  localStorage.clear();
  await createApp();
});
afterEach(() => localStorage.clear());

async function stable(): Promise<void> {
  await fixture.whenStable();
}

function card(repoId: string): HTMLElement {
  const found = page.querySelector<HTMLElement>(`[data-repo-id="${repoId}"]`);
  if (!found) throw new Error(`No card for ${repoId} in:\n${page.innerHTML}`);
  return found;
}

function toggle(repoId: string): HTMLButtonElement {
  return card(repoId).querySelector<HTMLButtonElement>('.repo-toggle')!;
}

function buttonByText(root: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
}

function collapseAllButton(): HTMLButtonElement | undefined {
  return buttonByText(page, 'Collapse all') ?? buttonByText(page, 'Expand all');
}

function attention(repoId: string): HTMLElement | null {
  return card(repoId).querySelector<HTMLElement>('.repo-attention');
}

const billing = aRepo({
  id: 'b1',
  name: 'billing',
  services: [aService({ id: 'api', name: 'api', status: 'running' }), aService({ id: 'web', name: 'web', status: 'stopped' })],
});
const shop = aRepo({ id: 's1', name: 'shop', services: [aService({ id: 'site', name: 'site' })] });

describe('collapsing a Repo', () => {
  it('▾/▸ hides the Services and run buttons and shows one status dot per Service', async () => {
    await transport.connectWith({ repos: [billing] });
    await stable();
    expect(toggle('b1').getAttribute('aria-expanded')).toBe('true');
    expect(toggle('b1').getAttribute('aria-label')).toBe('Collapse billing');
    expect(card('b1').querySelector('.collapsed-dots')).toBeNull();

    toggle('b1').click();
    await stable();

    expect(toggle('b1').getAttribute('aria-expanded')).toBe('false');
    expect(toggle('b1').getAttribute('aria-label')).toBe('Expand billing');
    expect(card('b1').querySelector('.services')).toBeNull();
    expect(card('b1').querySelector('.run-actions')).toBeNull();
    expect(card('b1').querySelector('.repo-name')!.textContent).toContain('billing');
    expect(buttonByText(card('b1'), 'Claude Code')).toBeDefined();
    const dots = [...card('b1').querySelectorAll<HTMLElement>('.collapsed-dots .status-dot')];
    expect(dots.map((d) => d.title)).toEqual(['api: Running', 'web: Stopped']);

    toggle('b1').click();
    await stable();
    expect(card('b1').querySelector('.services')).not.toBeNull();
  });

  it('clicking the Repo name toggles too', async () => {
    await transport.connectWith({ repos: [billing] });
    await stable();
    card('b1').querySelector<HTMLElement>('.repo-name')!.click();
    await stable();
    expect(card('b1').querySelector('.services')).toBeNull();
  });

  it('keeps the Remove confirmation and the "Folder not found" block', async () => {
    await transport.connectWith({ repos: [{ ...billing, folderMissing: true }] });
    await stable();
    toggle('b1').click();
    await stable();
    expect(card('b1').textContent).toContain('Folder not found');

    card('b1').querySelector<HTMLButtonElement>('[aria-label="Remove Repo billing"]')!.click();
    await stable();
    expect(card('b1').querySelector('[role="alertdialog"]')).not.toBeNull();
  });
});

describe('❗ in a collapsed Repo', () => {
  it('shows with a tooltip when a Service crashed, and the Repo stays collapsed', async () => {
    await transport.connectWith({ repos: [billing] });
    await stable();
    toggle('b1').click();
    await stable();
    expect(attention('b1')).toBeNull();

    transport.emit('statusChanged', { repoId: 'b1', serviceId: 'api', status: 'crashed' });
    await stable();
    expect(attention('b1')!.title).toBe('api crashed');
    expect(card('b1').querySelector('.services')).toBeNull();
  });

  it('names an unhealthy Service, a port conflict, an invalid config and a missing folder', async () => {
    await transport.connectWith({
      repos: [
        aRepo({
          id: 'b1',
          name: 'billing',
          configError: 'bad yaml',
          folderMissing: true,
          services: [
            aService({ id: 'api', name: 'api', status: 'unhealthy' }),
            aService({
              id: 'web',
              name: 'web',
              portConflict: { port: 3000, reason: 'start', owner: { kind: 'process', pid: 1, processName: 'node' } },
            }),
          ],
        }),
      ],
    });
    await stable();
    toggle('b1').click();
    await stable();
    expect(attention('b1')!.title.split('\n')).toEqual([
      'The folder was not found',
      'The config has an error',
      'api is not responding',
      'web: port 3000 is busy',
    ]);
  });

  it('names a Service with a Build Error, whose dot shows it too', async () => {
    await transport.connectWith({ repos: [billing] });
    await stable();
    toggle('b1').click();
    await stable();

    transport.emit('buildErrorChanged', { repoId: 'b1', serviceId: 'api', buildError: true });
    await stable();
    expect(attention('b1')!.title).toBe('api: the build has errors');
    const dot = card('b1').querySelector<HTMLElement>('.collapsed-dots .status-dot')!;
    expect(dot.classList).toContain('status-build-error');
    expect(dot.title).toBe('api: The build has errors, see the terminal');

    transport.emit('buildErrorChanged', { repoId: 'b1', serviceId: 'api', buildError: false });
    await stable();
    expect(attention('b1')).toBeNull();
  });

  it('does not show while the Repo is expanded', async () => {
    await transport.connectWith({ repos: [{ ...billing, folderMissing: true }] });
    await stable();
    expect(attention('b1')).toBeNull();
  });
});

describe('Collapse all / Expand all', () => {
  it('collapses every Repo, then expands every Repo', async () => {
    await transport.connectWith({ repos: [billing, shop] });
    await stable();
    toggle('s1').click();
    await stable();
    expect(collapseAllButton()!.textContent!.trim()).toBe('Collapse all');

    collapseAllButton()!.click();
    await stable();
    expect(card('b1').querySelector('.services')).toBeNull();
    expect(card('s1').querySelector('.services')).toBeNull();
    expect(collapseAllButton()!.textContent!.trim()).toBe('Expand all');

    collapseAllButton()!.click();
    await stable();
    expect(card('b1').querySelector('.services')).not.toBeNull();
    expect(card('s1').querySelector('.services')).not.toBeNull();
  });

  it('is not shown without Repos', async () => {
    await transport.connectWith({ repos: [] });
    await stable();
    expect(collapseAllButton()).toBeUndefined();
  });
});

describe('remembering collapsed Repos', () => {
  it('survives a page reload; a newly added Repo is expanded', async () => {
    await transport.connectWith({ repos: [billing, shop] });
    await stable();
    toggle('b1').click();
    await stable();

    TestBed.resetTestingModule();
    await createApp();
    await transport.connectWith({ repos: [billing, shop, aRepo({ id: 'n1', name: 'new' })] });
    await stable();
    expect(card('b1').querySelector('.services')).toBeNull();
    expect(card('s1').querySelector('.services')).not.toBeNull();
    expect(card('n1').querySelector('.services')).not.toBeNull();
  });

  it('drops ids of Repos no longer in the Workspace', async () => {
    await transport.connectWith({ repos: [billing, shop] });
    await stable();
    toggle('b1').click();
    toggle('s1').click();
    await stable();

    transport.emit('repoChanged', { repoId: 's1', repo: null });
    await stable();
    expect(JSON.parse(localStorage.getItem('devpanel.collapsedRepos')!)).toEqual(['b1']);
  });

  it('drops remembered ids of Repos removed while the page was closed', async () => {
    localStorage.setItem('devpanel.collapsedRepos', JSON.stringify(['b1', 'gone']));
    TestBed.resetTestingModule();
    await createApp();
    await transport.connectWith({ repos: [billing] });
    await stable();
    expect(card('b1').querySelector('.services')).toBeNull();
    expect(JSON.parse(localStorage.getItem('devpanel.collapsedRepos')!)).toEqual(['b1']);
  });

  it('with storage that throws, nothing is remembered and collapsing still works', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    TestBed.resetTestingModule();
    await createApp();
    await transport.connectWith({ repos: [billing] });
    await stable();
    expect(card('b1').querySelector('.services')).not.toBeNull();

    toggle('b1').click();
    await stable();
    expect(card('b1').querySelector('.services')).toBeNull();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
