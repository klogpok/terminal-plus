import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { App } from '../app';
import { BACKEND_TRANSPORT } from '../backend/backend-transport';
import { FakeTransport, type TestSnapshot } from '../backend/fake-transport';
import { loadTheme } from '../theme';
import { RELOAD_PAGE, loadUiLanguage } from '../ui-language';

let fixture: ComponentFixture<App>;

/**
 * Renders the app attached to the document, so focus and clicks outside Settings behave as in a
 * browser.
 */
async function openDevPanel(snapshot: TestSnapshot = { repos: [] }): Promise<HTMLElement> {
  loadUiLanguage();
  const transport = new FakeTransport();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      { provide: BACKEND_TRANSPORT, useValue: transport },
      { provide: RELOAD_PAGE, useValue: vi.fn() },
    ],
  });
  fixture = TestBed.createComponent(App);
  const page = fixture.nativeElement as HTMLElement;
  document.body.appendChild(page);
  await transport.connectWith(snapshot);
  await fixture.whenStable();
  return page;
}

function gear(page: HTMLElement): HTMLButtonElement {
  const found = page.querySelector<HTMLButtonElement>('.settings-button');
  if (!found) throw new Error(`No Settings button in:\n${page.innerHTML}`);
  return found;
}

function settingsOpen(page: HTMLElement): boolean {
  return page.querySelector('.settings-panel') !== null;
}

async function openSettings(page: HTMLElement): Promise<void> {
  gear(page).click();
  await fixture.whenStable();
}

afterEach(() => {
  (fixture.nativeElement as HTMLElement).remove();
  localStorage.clear();
  loadUiLanguage();
  loadTheme();
});

describe('Settings button', () => {
  it('is a named gear in the header, closed, and the language and Theme switches are not shown', async () => {
    const page = await openDevPanel();

    expect(page.querySelector('.topbar')!.contains(gear(page))).toBe(true);
    expect(gear(page).getAttribute('aria-label')).toBe('Settings');
    expect(gear(page).getAttribute('aria-expanded')).toBe('false');
    expect(settingsOpen(page)).toBe(false);
    expect(page.querySelector('[data-ui-language]')).toBeNull();
    expect(page.querySelector('[data-theme-choice]')).toBeNull();
  });

  it('is named in Russian when the UI Language is Russian', async () => {
    localStorage.setItem('devpanel.uiLanguage', 'ru');
    const page = await openDevPanel({ repos: [], uiLanguage: 'ru' });

    expect(gear(page).getAttribute('aria-label')).toBe('Настройки');
  });

  it('labels the "open the terminal tab" setting in Russian when the UI Language is Russian', async () => {
    localStorage.setItem('devpanel.uiLanguage', 'ru');
    const page = await openDevPanel({ repos: [], uiLanguage: 'ru' });

    await openSettings(page);

    expect(page.querySelector('.settings-panel label')!.textContent!.trim()).toBe(
      'Открывать вкладку терминала при запуске Сервиса',
    );
  });

  it('opens Settings with the language and Theme switches', async () => {
    const page = await openDevPanel();

    await openSettings(page);

    expect(gear(page).getAttribute('aria-expanded')).toBe('true');
    expect(settingsOpen(page)).toBe(true);
    expect(page.querySelectorAll('.settings-panel [data-ui-language]')).toHaveLength(2);
    expect(page.querySelectorAll('.settings-panel [data-theme-choice]')).toHaveLength(3);
  });

  it('closes on a second click of the gear', async () => {
    const page = await openDevPanel();

    await openSettings(page);
    gear(page).click();
    await fixture.whenStable();

    expect(gear(page).getAttribute('aria-expanded')).toBe('false');
    expect(settingsOpen(page)).toBe(false);
  });

  it('closes on Escape and gives focus back to the gear', async () => {
    const page = await openDevPanel();
    await openSettings(page);
    page.querySelector<HTMLButtonElement>('[data-theme-choice="dark"]')!.focus();

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(settingsOpen(page)).toBe(false);
    expect(document.activeElement).toBe(gear(page));
  });

  it('stays open on a click inside and closes on a click outside', async () => {
    const page = await openDevPanel();
    await openSettings(page);

    page.querySelector<HTMLButtonElement>('[data-theme-choice="dark"]')!.click();
    await fixture.whenStable();
    expect(settingsOpen(page)).toBe(true);

    page.querySelector<HTMLElement>('.app-title')!.click();
    await fixture.whenStable();
    expect(settingsOpen(page)).toBe(false);
  });
});
