import { TestBed, type ComponentFixture } from '@angular/core/testing';
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

function serviceRow(repoId: string, serviceId: string): HTMLElement {
  const row = page.querySelector<HTMLElement>(`[data-repo-id="${repoId}"] [data-service-id="${serviceId}"]`);
  if (!row) throw new Error(`No row for ${repoId}/${serviceId} in:\n${page.innerHTML}`);
  return row;
}

function dot(repoId: string, serviceId: string): HTMLElement {
  return serviceRow(repoId, serviceId).querySelector<HTMLElement>('.status-dot')!;
}

function button(repoId: string, serviceId: string, label: string): HTMLButtonElement {
  const found = [...serviceRow(repoId, serviceId).querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label')?.startsWith(label),
  );
  if (!found) throw new Error(`No "${label}" button for ${repoId}/${serviceId}`);
  return found;
}

const billing = aRepo({
  id: 'b1',
  name: 'Billing',
  color: '#e91e63',
  services: [
    aService({ id: 'api', name: 'API', status: 'running' }),
    aService({ id: 'web', name: 'Web', status: 'stopped' }),
    aService({ id: 'job', name: 'Job', status: 'crashed' }),
    aService({ id: 'once', name: 'Once', status: 'exited' }),
  ],
});
const docs = aRepo({ id: 'd1', name: 'Docs', services: [aService({ id: 'watch', status: 'starting' })] });

describe('left panel', () => {
  it('lists Repos with a color border and name, and their Services with status dots', async () => {
    await transport.connectWith({ repos: [billing, docs] });
    await stable();

    const repos = [...page.querySelectorAll<HTMLElement>('[data-repo-id]')];
    expect(repos.map((r) => r.querySelector('.repo-name')?.textContent?.trim())).toEqual(['Billing', 'Docs']);
    expect(repos[0]!.style.borderColor).toBe('rgb(233, 30, 99)');

    expect(serviceRow('b1', 'api').textContent).toContain('API');
    expect(dot('b1', 'api').classList).toContain('status-running');
    expect(dot('b1', 'api').title).toBe('Работает');
    expect(dot('b1', 'web').title).toBe('Остановлен');
    expect(dot('d1', 'watch').classList).toContain('status-starting');
  });

  it('tells crashed and exited apart from stopped', async () => {
    await transport.connectWith({ repos: [billing] });
    await stable();

    expect(dot('b1', 'job').classList).toContain('status-crashed');
    expect(dot('b1', 'job').title).toBe('Упал');
    expect(dot('b1', 'once').classList).toContain('status-exited');
    expect(dot('b1', 'once').title).toBe('Завершился сам');
    expect(dot('b1', 'web').classList).toContain('status-stopped');
  });

  it('▶ ■ ⟳ send the matching command for that Service', async () => {
    await transport.connectWith({ repos: [billing] });
    await stable();

    button('b1', 'web', 'Запустить').click();
    button('b1', 'api', 'Остановить').click();
    button('b1', 'api', 'Перезапустить').click();

    expect(transport.sent.slice(1).map((m) => [m.type, m.payload])).toEqual([
      ['startService', { repoId: 'b1', serviceId: 'web' }],
      ['stopService', { repoId: 'b1', serviceId: 'api' }],
      ['restartService', { repoId: 'b1', serviceId: 'api' }],
    ]);
  });

  it('enables only the buttons that make sense for the Status', async () => {
    await transport.connectWith({ repos: [billing] });
    await stable();

    expect(button('b1', 'api', 'Запустить').disabled).toBe(true);
    expect(button('b1', 'api', 'Остановить').disabled).toBe(false);
    expect(button('b1', 'web', 'Запустить').disabled).toBe(false);
    expect(button('b1', 'web', 'Остановить').disabled).toBe(true);
    expect(button('b1', 'job', 'Запустить').disabled).toBe(false);
  });

  it('updates a status dot when the Server reports a new Status', async () => {
    await transport.connectWith({ repos: [billing] });
    await stable();

    transport.emit('statusChanged', { repoId: 'b1', serviceId: 'web', status: 'running' });
    await stable();

    expect(dot('b1', 'web').classList).toContain('status-running');
  });

  it('rebuilds the list from the snapshot after a reconnect', async () => {
    await transport.connectWith({ repos: [billing] });
    await stable();
    transport.close('socket closed (1006)');
    await stable();
    expect(page.textContent).toContain('Нет связи с DevPanel');

    await transport.connectWith({ repos: [docs] });
    await stable();

    expect(page.textContent).not.toContain('Нет связи с DevPanel');
    expect(page.querySelector('[data-repo-id="b1"]')).toBeNull();
    expect(dot('d1', 'watch').classList).toContain('status-starting');
  });
});

describe('errors', () => {
  it('show a plain-Russian message with technical details under "Подробнее"', async () => {
    await transport.connectWith({ repos: [billing] });
    await stable();

    button('b1', 'web', 'Запустить').click();
    await transport.fail(transport.lastCommand('startService'), {
      code: 'spawnFailed',
      params: { repoName: 'Billing', serviceName: 'Web' },
      details: 'spawn cmd.exe ENOENT',
    });
    await stable();

    const error = page.querySelector<HTMLElement>('.error')!;
    expect(error.querySelector('.error-message')!.textContent).toContain('Не удалось запустить сервис Web из репо Billing.');
    const details = error.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')!.textContent).toContain('Подробнее');
    expect(details.textContent).toContain('spawn cmd.exe ENOENT');

    error.querySelector<HTMLButtonElement>('button[aria-label="Закрыть"]')!.click();
    await stable();
    expect(page.querySelector('.error')).toBeNull();
  });

  it('show a Repo Config error on the Repo the same way', async () => {
    const broken = aRepo({ id: 'x1', name: 'Broken', configError: 'services.0.command: Required' });
    await transport.connectWith({ repos: [broken] });
    await stable();

    const repo = page.querySelector<HTMLElement>('[data-repo-id="x1"]')!;
    expect(repo.querySelector('.error-message')!.textContent).toContain('В файле настроек репо Broken ошибка');
    expect(repo.querySelector('details')!.textContent).toContain('services.0.command: Required');
  });
});

describe('left panel splitter', () => {
  afterEach(() => localStorage.clear());

  function splitter(): HTMLElement {
    return page.querySelector<HTMLElement>('[role="separator"]')!;
  }

  function leftWidth(): string {
    return page.querySelector<HTMLElement>('aside.left')!.style.width;
  }

  it('resizes the Repo list with the arrow keys and remembers the width', async () => {
    splitter().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await stable();

    expect(leftWidth()).toBe('360px');
    expect(localStorage.getItem('devpanel.leftWidth')).toBe('360');
  });

  it('keeps the width within its limits and resets it on double-click', async () => {
    for (let i = 0; i < 50; i++) splitter().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    await stable();
    expect(leftWidth()).toBe('200px');

    splitter().dispatchEvent(new MouseEvent('dblclick'));
    await stable();
    expect(leftWidth()).toBe('344px');
  });
});
