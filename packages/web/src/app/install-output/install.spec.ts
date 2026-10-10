import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { App } from '../app';
import { BACKEND_TRANSPORT } from '../backend/backend-transport';
import { FakeTransport } from '../backend/fake-transport';
import { aRepo, aService } from '../backend/test-data';
import { FakeTerminalView } from '../terminal/fake-terminal-view';
import { TERMINAL_VIEW_FACTORY } from '../terminal/terminal-view';

let transport: FakeTransport;
let fixture: ComponentFixture<App>;
let page: HTMLElement;

beforeEach(async () => {
  transport = new FakeTransport();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      { provide: BACKEND_TRANSPORT, useValue: transport },
      { provide: TERMINAL_VIEW_FACTORY, useValue: FakeTerminalView.factory },
    ],
  });
  fixture = TestBed.createComponent(App);
  page = fixture.nativeElement as HTMLElement;
  await fixture.whenStable();
});

afterEach(() => localStorage.clear());

async function stable(): Promise<void> {
  await fixture.whenStable();
}

function installButton(repoId: string): HTMLButtonElement | null {
  return page.querySelector<HTMLButtonElement>(`[data-repo-id="${repoId}"] button.install-button`);
}

function installTab(repoId: string): HTMLElement | null {
  return page.querySelector<HTMLElement>(`.install-output[data-install-repo-id="${repoId}"]`);
}

function selectedTab(): HTMLElement {
  const tab = page.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
  if (!tab) throw new Error('No selected tab');
  return tab;
}

/** The terminal of the (only) install tab. */
function installView(): FakeTerminalView {
  const view = FakeTerminalView.created.at(-1);
  if (!view) throw new Error('No terminal was created');
  return view;
}

const fresh = aRepo({
  id: 'b1',
  name: 'Billing',
  install: { state: 'needed' },
  services: [aService({ id: 'api', name: 'API' })],
});
const npmRepo = aRepo({ id: 'n1', name: 'Legacy', services: [aService({ id: 'web' })] });

describe('Install dependencies', () => {
  it('is offered only for a pnpm Repo without installed dependencies', async () => {
    await transport.connectWith({ repos: [fresh, npmRepo] });
    await stable();

    expect(installButton('b1')!.textContent).toContain('Установить зависимости');
    expect(installButton('n1')).toBeNull();
  });

  it('sends installDependencies and shows the install output in a tab', async () => {
    await transport.connectWith({ repos: [fresh] });
    await stable();

    installButton('b1')!.click();
    expect(transport.lastCommand('installDependencies').payload).toEqual({ repoId: 'b1' });
    transport.emit('installChanged', { repoId: 'b1', install: { state: 'running' } });
    transport.emit('installOutput', { repoId: 'b1', data: '\u001b[32mProgress: resolved 12\u001b[39m\r\n' });
    await stable();

    const tab = installTab('b1')!;
    expect(selectedTab().textContent).toContain('Установка зависимостей: Billing');
    expect(selectedTab().closest<HTMLElement>('.tab-wrap')!.style.borderTopColor).not.toBe('');
    // Raw pty output goes into an xterm, colors included.
    expect(installView().screen).toBe('\u001b[32mProgress: resolved 12\u001b[39m\r\n');
    expect(tab.querySelector('.install-status')!.textContent).toContain('Идёт установка');
    expect(installButton('b1')!.disabled).toBe(true);
  });

  it('reports success and the button disappears', async () => {
    await transport.connectWith({ repos: [fresh] });
    await stable();
    installButton('b1')!.click();
    transport.emit('installChanged', { repoId: 'b1', install: { state: 'running' } });
    await stable();

    transport.emit('installChanged', { repoId: 'b1' });
    await transport.reply(transport.lastCommand('installDependencies'), { ok: true, exitCode: 0 });
    await stable();

    expect(installButton('b1')).toBeNull();
    expect(installTab('b1')!.querySelector('.install-status')!.textContent).toContain('Зависимости установлены');
  });

  it('reports a failure and keeps the button', async () => {
    await transport.connectWith({ repos: [fresh] });
    await stable();
    installButton('b1')!.click();
    transport.emit('installChanged', { repoId: 'b1', install: { state: 'running' } });
    await stable();

    transport.emit('installChanged', { repoId: 'b1', install: { state: 'failed', exitCode: 1 } });
    await transport.reply(transport.lastCommand('installDependencies'), { ok: false, exitCode: 1 });
    await stable();

    expect(installButton('b1')!.disabled).toBe(false);
    expect(installTab('b1')!.querySelector('.install-status')!.textContent).toContain('Не удалось установить зависимости');
  });

  it('shows an install started from another browser tab too', async () => {
    await transport.connectWith({ repos: [fresh] });
    await stable();

    transport.emit('installChanged', { repoId: 'b1', install: { state: 'running' } });
    transport.emit('installOutput', { repoId: 'b1', data: 'Packages: +42\r\n' });
    await stable();

    expect(installView().screen).toContain('Packages: +42');
    expect(installButton('b1')!.textContent).toContain('Устанавливаем');
  });

  it('closes the output tab', async () => {
    await transport.connectWith({ repos: [fresh] });
    await stable();
    installButton('b1')!.click();
    transport.emit('installChanged', { repoId: 'b1' });
    await stable();

    page.querySelector<HTMLButtonElement>('button[aria-label="Закрыть вкладку Установка зависимостей: Billing"]')!.click();
    await stable();

    expect(installTab('b1')).toBeNull();
  });

  it('explains a missing pnpm with the corepack hint', async () => {
    await transport.connectWith({ repos: [fresh] });
    await stable();

    page.querySelector<HTMLButtonElement>('[data-service-id="api"] button[aria-label="Запустить API"]')!.click();
    await transport.fail(transport.lastCommand('startService'), {
      code: 'pnpmMissing',
      params: { repoName: 'Billing' },
      details: 'where pnpm: not found',
    });
    await stable();

    const message = page.querySelector('.errors .error-message')!.textContent!;
    expect(message).toContain('pnpm');
    expect(message).toContain('corepack enable');
  });
});
