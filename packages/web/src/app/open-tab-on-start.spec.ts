import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ServiceStatus } from '@devpanel/shared';
import { App } from './app';
import { BACKEND_TRANSPORT } from './backend/backend-transport';
import { FakeTransport } from './backend/fake-transport';
import { aRepo, aService } from './backend/test-data';
import { FakeTerminalView } from './terminal/fake-terminal-view';
import { TERMINAL_VIEW_FACTORY } from './terminal/terminal-view';

const SETTING_KEY = 'devpanel.openTabOnStart';
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

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

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
  await transport.connectWith({ repos: [billing, shop] });
  await fixture.whenStable();
}

async function openSettings(): Promise<void> {
  page.querySelector<HTMLButtonElement>('.settings-button')!.click();
  await fixture.whenStable();
}

function checkbox(): HTMLInputElement {
  const found = page.querySelector<HTMLInputElement>('[data-setting="openTabOnStart"]');
  if (!found) throw new Error(`No "open the terminal tab" checkbox in:\n${page.innerHTML}`);
  return found;
}

async function turnOn(): Promise<void> {
  await openSettings();
  checkbox().click();
  await fixture.whenStable();
}

async function setStatus(repoId: string, serviceId: string, status: ServiceStatus): Promise<void> {
  transport.emit('statusChanged', { repoId, serviceId, status });
  await fixture.whenStable();
}

async function openTabByHand(name: string): Promise<void> {
  page.querySelector<HTMLButtonElement>(`button[aria-label="Open the ${name} terminal"]`)!.click();
  await fixture.whenStable();
}

function tabs(): string[] {
  return [...page.querySelectorAll<HTMLElement>('[role="tab"]')].map((t) => t.textContent!.trim());
}

function shownTab(): string | undefined {
  return page.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.textContent?.trim();
}

describe('opening the terminal tab when a Service starts', () => {
  it('opens no tab while the setting is off', async () => {
    await loadPage();

    await setStatus('b1', 'api', 'starting');

    expect(tabs()).toEqual([]);
  });

  it('adds the tab of a starting Service and shows it when no tab was shown', async () => {
    await loadPage();
    await turnOn();

    await setStatus('b1', 'api', 'starting');

    expect(tabs()).toEqual(['Billing / API']);
    expect(shownTab()).toBe('Billing / API');
  });

  it('keeps the shown tab on screen while more Services start', async () => {
    await loadPage();
    await openTabByHand('DB');
    await turnOn();

    await setStatus('b1', 'api', 'starting');
    await setStatus('b1', 'web', 'starting');

    expect(tabs()).toEqual(['Shop / DB', 'Billing / API', 'Billing / Web']);
    expect(shownTab()).toBe('Shop / DB');
  });

  it('shows only the first of several tabs added when none was shown', async () => {
    await loadPage();
    await turnOn();

    await setStatus('b1', 'api', 'starting');
    await setStatus('s1', 'db', 'starting');

    expect(tabs()).toEqual(['Billing / API', 'Shop / DB']);
    expect(shownTab()).toBe('Billing / API');
  });

  it('keeps a shown Session tab on screen', async () => {
    await loadPage();
    await turnOn();
    transport.emit('sessionChanged', {
      session: { id: 'x1', repoId: 'b1', kind: 'shell', number: 1, state: 'running' },
    });
    await fixture.whenStable();
    const sessionTab = shownTab();

    await setStatus('b1', 'api', 'starting');

    expect(tabs()).toContain('Billing / API');
    expect(shownTab()).toBe(sessionTab);
  });

  it('does not add a second tab for a Service whose tab is open', async () => {
    await loadPage();
    await openTabByHand('API');
    await openTabByHand('DB');
    await turnOn();

    await setStatus('b1', 'api', 'starting');

    expect(tabs()).toEqual(['Billing / API', 'Shop / DB']);
    expect(shownTab()).toBe('Shop / DB');
  });

  it('leaves the remembered tab choice alone when the starting Service already has its tab', async () => {
    const remembered = { tabs: [{ repoId: 'b1', serviceId: 'api' }], active: 'gone/svc' };
    localStorage.setItem(TABS_KEY, JSON.stringify(remembered));
    await loadPage();
    await turnOn();

    await setStatus('b1', 'api', 'starting');

    expect(shownTab()).toBe('Billing / API');
    expect(JSON.parse(localStorage.getItem(TABS_KEY)!)).toEqual(remembered);
  });

  it('leaves the remembered tab choice alone when a tab is added behind a shown Service tab', async () => {
    localStorage.setItem(
      TABS_KEY,
      JSON.stringify({ tabs: [{ repoId: 'b1', serviceId: 'api' }], active: 'gone/svc' }),
    );
    await loadPage();
    await turnOn();

    await setStatus('s1', 'db', 'starting');

    expect(tabs()).toEqual(['Billing / API', 'Shop / DB']);
    expect(shownTab()).toBe('Billing / API');
    expect(JSON.parse(localStorage.getItem(TABS_KEY)!).active).toBe('gone/svc');
  });

  it('opens no tab for statuses other than starting', async () => {
    await loadPage();
    await turnOn();

    await setStatus('b1', 'api', 'running');
    await setStatus('b1', 'web', 'unhealthy');
    await setStatus('s1', 'db', 'stopped');

    expect(tabs()).toEqual([]);
  });

  it('stops opening tabs once turned off again', async () => {
    await loadPage();
    await turnOn();

    checkbox().click();
    await fixture.whenStable();
    await setStatus('b1', 'api', 'starting');

    expect(tabs()).toEqual([]);
    expect(localStorage.getItem(SETTING_KEY)).toBe('false');
  });
});

describe('the setting in Settings', () => {
  it('is an unchecked checkbox with a label and a hint', async () => {
    await loadPage();
    await openSettings();

    expect(checkbox().checked).toBe(false);
    expect(page.querySelector(`label[for="${checkbox().id}"]`)!.textContent!.trim()).toBe(
      'Open the terminal tab when a Service starts',
    );
    const hintId = checkbox().getAttribute('aria-describedby')!;
    expect(page.querySelector(`#${hintId}`)!.textContent).toContain('stays on screen');
  });

  it('survives a page reload', async () => {
    await loadPage();
    await turnOn();

    await loadPage();
    await openSettings();
    expect(checkbox().checked).toBe(true);
    await setStatus('b1', 'api', 'starting');
    expect(tabs()).toEqual(['Billing / API']);
  });

  it('is off when the stored value is unknown', async () => {
    localStorage.setItem(SETTING_KEY, 'yes');
    await loadPage();
    await openSettings();

    expect(checkbox().checked).toBe(false);
  });

  it('is off when storage is unavailable', async () => {
    localStorage.setItem(SETTING_KEY, 'true');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await loadPage();
    await openSettings();

    expect(checkbox().checked).toBe(false);
  });

  it('still applies to this page when storage is unavailable', async () => {
    await loadPage();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await turnOn();

    await setStatus('b1', 'api', 'starting');

    expect(tabs()).toEqual(['Billing / API']);
  });

  it('follows a change made in another tab of the same browser', async () => {
    await loadPage();
    await openSettings();

    localStorage.setItem(SETTING_KEY, 'true');
    window.dispatchEvent(new StorageEvent('storage', { key: SETTING_KEY, newValue: 'true' }));
    await fixture.whenStable();

    expect(checkbox().checked).toBe(true);
    await setStatus('b1', 'api', 'starting');
    expect(tabs()).toEqual(['Billing / API']);
  });
});
