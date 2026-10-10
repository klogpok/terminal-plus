import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { App } from '../app';
import { BACKEND_TRANSPORT } from '../backend/backend-transport';
import { FakeTransport } from '../backend/fake-transport';
import { aRepo, aService } from '../backend/test-data';
import { FakeTerminalView } from './fake-terminal-view';
import { TERMINAL_VIEW_FACTORY } from './terminal-view';

let transport: FakeTransport;
let fixture: ComponentFixture<App>;
let page: HTMLElement;

const billing = aRepo({
  id: 'b1',
  name: 'Billing',
  color: '#e91e63',
  services: [aService({ id: 'api', name: 'API', status: 'running' }), aService({ id: 'web', name: 'Web' })],
});
const api = { repoId: 'b1', serviceId: 'api' };

beforeEach(async () => {
  localStorage.clear();
  await loadPage();
});
afterEach(() => localStorage.clear());

/** Creates the app as a fresh page load would (new injector, new transport). */
async function loadPage(): Promise<void> {
  TestBed.resetTestingModule();
  FakeTerminalView.created.length = 0;
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
  await transport.connectWith({ repos: [billing] });
  await stable();
}

async function stable(): Promise<void> {
  await fixture.whenStable();
}

async function openTab(name: string): Promise<void> {
  const opener = page.querySelector<HTMLButtonElement>(`button[aria-label="Открыть терминал ${name}"]`);
  if (!opener) throw new Error(`No terminal opener for ${name} in:\n${page.innerHTML}`);
  opener.click();
  await stable();
}

function tabs(): HTMLElement[] {
  return [...page.querySelectorAll<HTMLElement>('[role="tab"]')];
}

function view(index = 0): FakeTerminalView {
  const found = FakeTerminalView.created[index];
  if (!found) throw new Error(`Only ${FakeTerminalView.created.length} terminals were created`);
  return found;
}

describe('Service terminal tab', () => {
  it('opens on click, colored like its Repo', async () => {
    await openTab('API');

    expect(tabs().map((t) => t.textContent?.trim())).toEqual(['API']);
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs()[0]!.closest<HTMLElement>('.tab-wrap')!.style.borderTopColor).toBe('rgb(233, 30, 99)');
  });

  it('replays the buffered output first, then streams live output', async () => {
    await openTab('API');
    const request = transport.lastCommand('getServiceOutput');
    expect(request.payload).toEqual(api);

    // Arrives before the reply, so it is already part of the buffer.
    transport.emit('log', { ...api, data: 'line 2\r\n' });
    await transport.reply(request, '\u001b[32mline 1\u001b[0m\r\nline 2\r\n');
    transport.emit('log', { ...api, data: 'line 3\r\n' });
    transport.emit('log', { repoId: 'b1', serviceId: 'web', data: 'other service\r\n' });

    expect(view().screen).toBe('\u001b[32mline 1\u001b[0m\r\nline 2\r\nline 3\r\n');
  });

  it('replays the buffer again after a reconnect', async () => {
    await openTab('API');
    await transport.reply(transport.lastCommand('getServiceOutput'), 'old\r\n');
    transport.close();
    await stable();

    await transport.connectWith({ repos: [billing] });
    await stable();
    await transport.reply(transport.lastCommand('getServiceOutput'), 'old\r\nnew\r\n');

    expect(transport.commands('getServiceOutput')).toHaveLength(2);
    expect(view().screen).toBe('old\r\nnew\r\n');
  });

  it('reopens after a page reload', async () => {
    await openTab('API');

    await loadPage();

    expect(tabs().map((t) => t.textContent?.trim())).toEqual(['API']);
    await transport.reply(transport.lastCommand('getServiceOutput'), 'buffered\r\n');
    expect(view().screen).toBe('buffered\r\n');
  });

  it('sends typed keys to the Service pty', async () => {
    await openTab('API');

    view().type('y');
    view().type('\r');

    expect(transport.commands('writeToPty').map((c) => c.payload)).toEqual([
      { ...api, data: 'y' },
      { ...api, data: '\r' },
    ]);
  });

  it('sends its size to the pty when shown, also when shown again after another tab', async () => {
    await openTab('API');
    await settle();
    expect(transport.lastCommand('resizePty').payload).toEqual({ ...api, cols: 80, rows: 24 });

    await openTab('Web');
    await settle();
    expect(transport.lastCommand('resizePty').payload).toMatchObject({ serviceId: 'web' });

    tabs()[0]!.click();
    await stable();
    await settle();
    expect(transport.lastCommand('resizePty').payload).toEqual({ ...api, cols: 80, rows: 24 });
  });

  it('switches and closes tabs', async () => {
    await openTab('API');
    await openTab('Web');
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true']);

    page.querySelector<HTMLButtonElement>('button[aria-label="Закрыть вкладку Web"]')!.click();
    await stable();

    expect(tabs().map((t) => t.textContent?.trim())).toEqual(['API']);
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(view(1).disposed).toBe(true);
  });
});

describe('terminal toolbar', () => {
  beforeEach(async () => {
    await openTab('API');
    await transport.reply(transport.lastCommand('getServiceOutput'), 'error: port in use\r\n');
  });

  function tool(label: string): HTMLButtonElement {
    const found = [...page.querySelectorAll<HTMLButtonElement>('dp-service-terminal button')].find(
      (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
    );
    if (!found) throw new Error(`No "${label}" button`);
    return found;
  }

  it('"Очистить" empties the terminal', async () => {
    tool('Очистить').click();

    expect(view().screen).toBe('');
  });

  it('"Копировать всё" copies all terminal text', async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void copied.push(text) },
    });

    tool('Копировать всё').click();
    await settle();
    await stable();

    expect(copied).toEqual(['error: port in use\r\n']);
    expect(page.querySelector('dp-service-terminal [role="status"]')!.textContent).toContain('Скопировано');
  });

  it('search finds the next match on Enter and the previous one on Shift+Enter', async () => {
    const input = page.querySelector<HTMLInputElement>('dp-service-terminal input[type="search"]')!;
    input.value = 'error';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    tool('Найти дальше').click();

    expect(view().searches).toEqual(['next:error', 'previous:error', 'next:error']);
  });
});

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
