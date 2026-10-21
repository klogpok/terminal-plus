import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { SessionView } from '@devpanel/shared';
import { App } from './app';
import { BACKEND_TRANSPORT } from './backend/backend-transport';
import { FakeTransport } from './backend/fake-transport';
import { aRepo } from './backend/test-data';
import { FakeTerminalView } from './terminal/fake-terminal-view';
import { TERMINAL_VIEW_FACTORY } from './terminal/terminal-view';

const SETTING_KEY = 'devpanel.closeWithoutAsking';

let transport: FakeTransport;
let fixture: ComponentFixture<App>;
let page: HTMLElement;

const billing = aRepo({ id: 'b1', name: 'Billing' });
const shell1: SessionView = { id: 's1', repoId: 'b1', kind: 'shell', number: 1, state: 'running' };

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

/** Creates the app as a fresh page load would, with one running Session tab. */
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
  await transport.connectWith({ repos: [billing], sessions: [shell1] });
  await fixture.whenStable();
}

async function openSettings(): Promise<void> {
  page.querySelector<HTMLButtonElement>('.settings-button')!.click();
  await fixture.whenStable();
}

function checkbox(): HTMLInputElement {
  const found = page.querySelector<HTMLInputElement>('[data-setting="closeWithoutAsking"]');
  if (!found) throw new Error(`No "close without asking" checkbox in:\n${page.innerHTML}`);
  return found;
}

async function turnOn(): Promise<void> {
  await openSettings();
  checkbox().click();
  await fixture.whenStable();
}

async function closeTab(): Promise<void> {
  page.querySelector<HTMLButtonElement>('button[aria-label="Close the Terminal tab"]')!.click();
  await fixture.whenStable();
}

function closedSessions(): unknown[] {
  return transport.commands('closeSession').map((c) => c.payload);
}

describe('closing a running Session tab without asking', () => {
  it('asks first while the setting is off', async () => {
    await loadPage();

    await closeTab();

    expect(page.querySelector('.close-confirm')).not.toBeNull();
    expect(closedSessions()).toEqual([]);
  });

  it('ends the Session at once while the setting is on', async () => {
    await loadPage();
    await turnOn();

    await closeTab();

    expect(page.querySelector('.close-confirm')).toBeNull();
    expect(closedSessions()).toEqual([{ sessionId: 's1' }]);
  });
});

describe('the close-without-asking setting in Settings', () => {
  it('is an unchecked checkbox with a label and a hint', async () => {
    await loadPage();
    await openSettings();

    expect(checkbox().checked).toBe(false);
    expect(page.querySelector(`label[for="${checkbox().id}"]`)!.textContent!.trim()).toBe(
      "Close a running Session's tab without asking",
    );
    const hintId = checkbox().getAttribute('aria-describedby')!;
    expect(page.querySelector(`#${hintId}`)!.textContent).toContain('ends at once');
  });

  it('survives a page reload', async () => {
    await loadPage();
    await turnOn();
    expect(localStorage.getItem(SETTING_KEY)).toBe('true');

    await loadPage();
    await closeTab();

    expect(closedSessions()).toEqual([{ sessionId: 's1' }]);
  });

  it('is off when storage is unavailable', async () => {
    localStorage.setItem(SETTING_KEY, 'true');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await loadPage();

    await closeTab();

    expect(page.querySelector('.close-confirm')).not.toBeNull();
  });

  it('follows a change made in another tab of the same browser', async () => {
    await loadPage();

    localStorage.setItem(SETTING_KEY, 'true');
    window.dispatchEvent(new StorageEvent('storage', { key: SETTING_KEY, newValue: 'true' }));
    await fixture.whenStable();
    await closeTab();

    expect(closedSessions()).toEqual([{ sessionId: 's1' }]);
  });
});
