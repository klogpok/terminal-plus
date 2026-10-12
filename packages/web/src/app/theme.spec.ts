import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { App } from './app';
import { BACKEND_TRANSPORT } from './backend/backend-transport';
import { FakeTransport } from './backend/fake-transport';
import { loadTheme } from './theme';

let fixture: ComponentFixture<App>;

/** Applies the stored Theme the way main.ts does at page load, then renders the app. */
async function openDevPanel(): Promise<HTMLElement> {
  loadTheme();
  const transport = new FakeTransport();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [{ provide: BACKEND_TRANSPORT, useValue: transport }],
  });
  fixture = TestBed.createComponent(App);
  await transport.connectWith({ repos: [] });
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function themeButton(page: HTMLElement, theme: string): HTMLButtonElement {
  const found = page.querySelector<HTMLButtonElement>(`[data-theme-choice="${theme}"]`);
  if (!found) throw new Error(`No ${theme} button in:\n${page.innerHTML}`);
  return found;
}

function pressed(page: HTMLElement): string[] {
  return [...page.querySelectorAll<HTMLElement>('[data-theme-choice][aria-pressed="true"]')].map(
    (b) => b.dataset['themeChoice']!,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  loadTheme();
});

describe('Theme at page load', () => {
  it('follows the system when no Theme is stored', async () => {
    const page = await openDevPanel();

    expect(pressed(page)).toEqual(['system']);
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('applies the stored Theme', async () => {
    localStorage.setItem('devpanel.theme', 'dark');
    const page = await openDevPanel();

    expect(pressed(page)).toEqual(['dark']);
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('follows the system when the stored value is unknown', async () => {
    localStorage.setItem('devpanel.theme', 'sepia');
    const page = await openDevPanel();

    expect(pressed(page)).toEqual(['system']);
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('follows the system when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const page = await openDevPanel();

    expect(pressed(page)).toEqual(['system']);
  });
});

describe('choosing a Theme', () => {
  it('applies and remembers it, and System removes the override', async () => {
    const page = await openDevPanel();

    themeButton(page, 'light').click();
    await fixture.whenStable();
    expect(pressed(page)).toEqual(['light']);
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('devpanel.theme')).toBe('light');

    themeButton(page, 'system').click();
    await fixture.whenStable();
    expect(document.documentElement.dataset['theme']).toBeUndefined();
    expect(localStorage.getItem('devpanel.theme')).toBe('system');
  });

  it('still applies to this page when storage is unavailable', async () => {
    const page = await openDevPanel();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    themeButton(page, 'dark').click();
    await fixture.whenStable();

    expect(pressed(page)).toEqual(['dark']);
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('follows a choice made in another tab', async () => {
    const page = await openDevPanel();

    localStorage.setItem('devpanel.theme', 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'devpanel.theme', newValue: 'dark' }));
    await fixture.whenStable();

    expect(pressed(page)).toEqual(['dark']);
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('has a named button for every Theme', async () => {
    const page = await openDevPanel();

    expect(themeButton(page, 'system').getAttribute('aria-label')).toBe('System theme');
    expect(themeButton(page, 'light').getAttribute('aria-label')).toBe('Light theme');
    expect(themeButton(page, 'dark').getAttribute('aria-label')).toBe('Dark theme');
  });
});
