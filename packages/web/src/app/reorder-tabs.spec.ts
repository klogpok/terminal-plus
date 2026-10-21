import { CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { RepoView, SessionView } from '@devpanel/shared';
import { App } from './app';
import { BACKEND_TRANSPORT } from './backend/backend-transport';
import { FakeTransport } from './backend/fake-transport';
import { aRepo, aService } from './backend/test-data';
import { FakeTerminalView } from './terminal/fake-terminal-view';
import { TERMINAL_VIEW_FACTORY } from './terminal/terminal-view';

const TABS_KEY = 'devpanel.terminalTabs';

let transport: FakeTransport;
let fixture: ComponentFixture<App>;
let page: HTMLElement;

const billing = aRepo({
  id: 'b1',
  name: 'Billing',
  services: [aService({ id: 'api', name: 'API' }), aService({ id: 'web', name: 'Web' })],
});
const shop = aRepo({ id: 's1', name: 'Shop', services: [aService({ id: 'db', name: 'DB' })] });
const shell: SessionView = { id: 'x1', repoId: 'b1', kind: 'shell', number: 1, state: 'running' };

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

/** Creates the app as a fresh page load would (new injector, new transport). */
async function loadPage(repos: RepoView[] = [billing, shop], sessions: SessionView[] = []): Promise<void> {
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
  await transport.connectWith({ repos, sessions });
  await fixture.whenStable();
}

async function openTab(name: string): Promise<void> {
  page.querySelector<HTMLButtonElement>(`button[aria-label="Open the ${name} terminal"]`)!.click();
  await fixture.whenStable();
}

async function openSession(session: SessionView): Promise<void> {
  transport.emit('sessionChanged', { session });
  await fixture.whenStable();
}

function tabs(): string[] {
  return [...page.querySelectorAll<HTMLElement>('[role="tab"]')].map((t) => t.textContent!.trim());
}

/** Plays a finished drag of the tab at `from` onto position `to`, as CDK reports it. */
async function drop(from: number, to: number): Promise<void> {
  const list = fixture.debugElement.query(By.css('.strip')).injector.get(CdkDropList);
  list.dropped.emit({ previousIndex: from, currentIndex: to } as CdkDragDrop<unknown>);
  await fixture.whenStable();
}

describe('reordering terminal tabs', () => {
  it('moves a tab to where it was dropped', async () => {
    await loadPage();
    await openTab('API');
    await openTab('Web');
    await openTab('DB');

    await drop(2, 0);

    expect(tabs()).toEqual(['Shop / DB', 'Billing / API', 'Billing / Web']);
  });

  it('puts a Session tab between Service tabs', async () => {
    await loadPage();
    await openTab('API');
    await openTab('DB');
    await openSession(shell);
    const session = tabs()[2]!;

    await drop(2, 1);

    expect(tabs()).toEqual(['Billing / API', session, 'Shop / DB']);
  });

  it('changes nothing when a tab is dropped where it was', async () => {
    await loadPage();
    await openTab('API');
    await openTab('DB');

    await drop(1, 1);

    expect(tabs()).toEqual(['Billing / API', 'Shop / DB']);
  });

  it('keeps the order over a page reload', async () => {
    await loadPage();
    await openTab('API');
    await openTab('DB');
    await openSession(shell);
    const session = tabs()[2]!;
    await drop(2, 0);
    await drop(2, 1);

    await loadPage([billing, shop], [shell]);

    expect(tabs()).toEqual([session, 'Shop / DB', 'Billing / API']);
  });

  it('adds a new tab at the end of the strip, after Session tabs', async () => {
    await loadPage();
    await openTab('API');
    await openSession(shell);
    const session = tabs()[1]!;

    await openTab('DB');

    expect(tabs()).toEqual(['Billing / API', session, 'Shop / DB']);
  });

  it('puts the tab of a Service that comes back where it was', async () => {
    await loadPage();
    await openTab('API');
    await openTab('Web');
    await openTab('DB');
    await drop(0, 2);
    expect(tabs()).toEqual(['Billing / Web', 'Shop / DB', 'Billing / API']);

    await loadPage([shop]);
    expect(tabs()).toEqual(['Shop / DB']);
    await loadPage([billing, shop]);

    expect(tabs()).toEqual(['Billing / Web', 'Shop / DB', 'Billing / API']);
  });

  it('forgets the place of a closed tab', async () => {
    await loadPage();
    await openTab('API');
    await openTab('DB');
    await openSession(shell);
    await drop(2, 0);

    transport.emit('sessionClosed', { sessionId: 'x1', repoId: 'b1' });
    await fixture.whenStable();
    page.querySelector<HTMLButtonElement>('button[aria-label="Close the DB tab"]')!.click();
    await fixture.whenStable();

    expect(JSON.parse(localStorage.getItem(TABS_KEY)!).order).toEqual(['b1/api']);
  });
});
