import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { SessionView } from '@devpanel/shared';
import { App } from '../app';
import { BACKEND_TRANSPORT } from '../backend/backend-transport';
import { FakeTransport, type TestSnapshot } from '../backend/fake-transport';
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
  services: [aService({ id: 'api', name: 'API', status: 'running' })],
});
const shell1: SessionView = { id: 's1', repoId: 'b1', kind: 'shell', number: 1, state: 'running' };
const claude1: SessionView = { id: 'c1', repoId: 'b1', kind: 'claude', number: 1, state: 'running' };
const claude2: SessionView = { id: 'c2', repoId: 'b1', kind: 'claude', number: 2, state: 'running' };

beforeEach(async () => {
  localStorage.clear();
  await loadPage({ repos: [billing] });
});
afterEach(() => localStorage.clear());

/** Creates the app as a fresh page load would (new injector, new transport). */
async function loadPage(snapshot: TestSnapshot): Promise<void> {
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
  await transport.connectWith(snapshot);
  await stable();
}

async function stable(): Promise<void> {
  await fixture.whenStable();
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function button(label: string, root: ParentNode = page): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`No "${label}" button in:\n${(root as HTMLElement).innerHTML ?? ''}`);
  return found;
}

function tabs(): HTMLElement[] {
  return [...page.querySelectorAll<HTMLElement>('[role="tab"]')];
}

function tabTexts(): string[] {
  return tabs().map((t) => t.textContent!.replace(/\s+/g, ' ').trim());
}

function view(index = 0): FakeTerminalView {
  const found = FakeTerminalView.created[index];
  if (!found) throw new Error(`Only ${FakeTerminalView.created.length} terminals were created`);
  return found;
}

/** Clicks a Repo header button and plays the Server opening the Session. */
async function open(label: string, session: SessionView): Promise<void> {
  button(label).click();
  const command = transport.lastCommand(session.kind === 'claude' ? 'openClaude' : 'openTerminal');
  expect(command.payload).toEqual({ repoId: 'b1' });
  transport.emit('sessionChanged', { session });
  await transport.reply(command, session);
  await stable();
}

describe('opening Sessions', () => {
  it('"Терминал" opens a shell Session tab colored like the Repo, and shows it', async () => {
    await open('Открыть терминал в Billing', shell1);

    expect(tabTexts()).toEqual(['Терминал']);
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs()[0]!.closest<HTMLElement>('.tab-wrap')!.style.borderTopColor).toBe('rgb(233, 30, 99)');
  });

  it('"Claude Code" opens one more Session per click', async () => {
    await open('Открыть Claude Code в Billing', claude1);
    await open('Открыть Claude Code в Billing', claude2);

    expect(tabTexts()).toEqual(['Claude Code', 'Claude Code 2']);
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true']);
  });

  it('explains plainly when Claude Code is not installed', async () => {
    button('Открыть Claude Code в Billing').click();
    await transport.fail(transport.lastCommand('openClaude'), { code: 'claudeMissing', params: {}, details: 'where claude' });
    await stable();

    expect(page.querySelector('.error-message')!.textContent).toContain('Claude Code не установлен');
    expect(tabs()).toEqual([]);
  });

  it('shows Sessions opened from another browser tab too', async () => {
    transport.emit('sessionChanged', { session: shell1 });
    await stable();

    expect(tabTexts()).toEqual(['Терминал']);
  });
});

describe('Session terminal', () => {
  it('replays the buffer, streams output, sends input and size', async () => {
    await open('Открыть терминал в Billing', shell1);
    const request = transport.lastCommand('getSessionOutput');
    expect(request.payload).toEqual({ sessionId: 's1' });

    transport.emit('sessionOutput', { sessionId: 's1', data: 'b\r\n' }); // already in the buffer
    await transport.reply(request, 'a\r\nb\r\n');
    transport.emit('sessionOutput', { sessionId: 's1', data: 'c\r\n' });
    transport.emit('sessionOutput', { sessionId: 'other', data: 'nope\r\n' });
    transport.emit('log', { repoId: 'b1', serviceId: 'api', data: 'service\r\n' });
    expect(view().screen).toBe('a\r\nb\r\nc\r\n');

    view().type('dir\r');
    expect(transport.lastCommand('writeToSession').payload).toEqual({ sessionId: 's1', data: 'dir\r' });
    await settle();
    expect(transport.lastCommand('resizeSession').payload).toEqual({ sessionId: 's1', cols: 80, rows: 24 });
  });

  it('reappears with its buffered output after a page reload', async () => {
    await loadPage({ repos: [billing], sessions: [shell1, { ...claude1, state: 'finished', exitCode: 0 }] });

    expect(tabTexts()).toEqual(['Терминал', 'Claude Code (завершена)']);
    await transport.reply(transport.commands('getSessionOutput')[0]!, 'history\r\n');
    expect(view().screen).toBe('history\r\n');
  });

  it('marks a Session that ended by itself as finished and keeps its tab', async () => {
    await open('Открыть терминал в Billing', shell1);

    transport.emit('sessionChanged', { session: { ...shell1, state: 'finished', exitCode: 0 } });
    await stable();

    expect(tabTexts()).toEqual(['Терминал (завершена)']);
    expect(page.querySelector('dp-service-terminal .ended')!.textContent).toContain('Сессия завершена');
  });
});

describe('closing a Session tab', () => {
  it('asks first while the Session runs, then ends it with closeSession', async () => {
    await open('Открыть терминал в Billing', shell1);

    button('Закрыть вкладку Терминал').click();
    await stable();
    const confirm = page.querySelector<HTMLElement>('.close-confirm')!;
    expect(confirm.textContent).toContain('ещё работает');
    expect(transport.commands('closeSession')).toEqual([]);

    button('Завершить', confirm).click();
    const command = transport.lastCommand('closeSession');
    expect(command.payload).toEqual({ sessionId: 's1' });
    transport.emit('sessionClosed', { sessionId: 's1', repoId: 'b1' });
    await transport.reply(command, null);
    await stable();

    expect(tabs()).toEqual([]);
    expect(page.querySelector('.close-confirm')).toBeNull();
  });

  it('can be cancelled', async () => {
    await open('Открыть терминал в Billing', shell1);

    button('Закрыть вкладку Терминал').click();
    await stable();
    button('Отмена', page.querySelector('.close-confirm')!).click();
    await stable();

    expect(transport.commands('closeSession')).toEqual([]);
    expect(page.querySelector('.close-confirm')).toBeNull();
    expect(tabTexts()).toEqual(['Терминал']);
  });

  it('closes a finished Session without asking', async () => {
    await loadPage({ repos: [billing], sessions: [{ ...shell1, state: 'finished', exitCode: 1 }] });

    button('Закрыть вкладку Терминал').click();
    await stable();

    expect(page.querySelector('.close-confirm')).toBeNull();
    expect(transport.lastCommand('closeSession').payload).toEqual({ sessionId: 's1' });
  });
});

describe('removing a Repo with Sessions', () => {
  it('lists its running Sessions among what will be stopped', async () => {
    await loadPage({ repos: [billing], sessions: [shell1, claude1, { ...claude2, state: 'finished', exitCode: 0 }] });

    button('Удалить репо Billing').click();
    await stable();

    expect(page.querySelector('.remove-confirm')!.textContent).toContain('Будут остановлены: API, Терминал, Claude Code.');
  });
});
