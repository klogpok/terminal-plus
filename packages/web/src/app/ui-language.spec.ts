import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { App } from './app';
import { BACKEND_TRANSPORT } from './backend/backend-transport';
import { FakeTransport, type TestSnapshot } from './backend/fake-transport';
import { RELOAD_PAGE, loadUiLanguage } from './ui-language';

let transport: FakeTransport;
let fixture: ComponentFixture<App>;
let reload: ReturnType<typeof vi.fn>;

/** Loads the UI Language the way main.ts does at page load, then renders the app. */
async function openDevPanel(snapshot: TestSnapshot = { repos: [] }): Promise<HTMLElement> {
  loadUiLanguage();
  transport = new FakeTransport();
  reload = vi.fn();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      { provide: BACKEND_TRANSPORT, useValue: transport },
      { provide: RELOAD_PAGE, useValue: reload },
    ],
  });
  fixture = TestBed.createComponent(App);
  await transport.connectWith(snapshot);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function languageButton(page: HTMLElement, language: string): HTMLButtonElement {
  const found = page.querySelector<HTMLButtonElement>(`[data-ui-language="${language}"]`);
  if (!found) throw new Error(`No ${language} button in:
${page.innerHTML}`);
  return found;
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  loadUiLanguage();
});

describe('UI Language at page load', () => {
  it('is English when no UI Language is cached', async () => {
    const page = await openDevPanel();

    expect(page.querySelector('.exit-button')!.textContent).toContain('Exit DevPanel');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('DevPanel');
  });

  it('is English when storage is unavailable', async () => {
    localStorage.setItem('devpanel.uiLanguage', 'ru');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    const page = await openDevPanel();

    expect(page.querySelector('.exit-button')!.textContent).toContain('Exit DevPanel');
    expect(document.documentElement.lang).toBe('en');
  });

  it('is Russian when Russian is cached', async () => {
    localStorage.setItem('devpanel.uiLanguage', 'ru');

    const page = await openDevPanel({ repos: [], uiLanguage: 'ru' });

    expect(page.querySelector('.exit-button')!.textContent).toContain('Выйти из DevPanel');
    expect(page.querySelector('[role="separator"]')!.getAttribute('aria-label')).toBe('Ширина списка репо');
    expect(document.documentElement.lang).toBe('ru');
    expect(document.title).toBe('DevPanel');
  });
});

describe('UI Language switch', () => {
  it('names both languages in their own language and marks the active one', async () => {
    const page = await openDevPanel();

    expect(languageButton(page, 'en').textContent!.trim()).toBe('English');
    expect(languageButton(page, 'ru').textContent!.trim()).toBe('Русский');
    expect(languageButton(page, 'en').getAttribute('aria-pressed')).toBe('true');
    expect(languageButton(page, 'ru').getAttribute('aria-pressed')).toBe('false');
  });

  it('pressing the other language asks the Server to set it; the active one sends nothing', async () => {
    const page = await openDevPanel();

    languageButton(page, 'en').click();
    expect(transport.commands('setUiLanguage')).toEqual([]);

    languageButton(page, 'ru').click();
    expect(transport.lastCommand('setUiLanguage').payload).toEqual({ language: 'ru' });
  });
});

describe('UI Language from the Server', () => {
  it('a matching snapshot does not reload', async () => {
    await openDevPanel({ repos: [], uiLanguage: 'en' });

    expect(reload).not.toHaveBeenCalled();
  });

  it('a snapshot in another language caches it and reloads once', async () => {
    await openDevPanel({ repos: [], uiLanguage: 'ru' });

    expect(localStorage.getItem('devpanel.uiLanguage')).toBe('ru');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('after that reload the page is Russian and stays put', async () => {
    localStorage.setItem('devpanel.uiLanguage', 'ru');

    const page = await openDevPanel({ repos: [], uiLanguage: 'ru' });

    expect(page.querySelector('.exit-button')!.textContent).toContain('Выйти из DevPanel');
    expect(languageButton(page, 'ru').getAttribute('aria-pressed')).toBe('true');
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload when the language cannot be cached (it would reload forever)', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    await openDevPanel({ repos: [], uiLanguage: 'ru' });

    expect(reload).not.toHaveBeenCalled();
  });

  it('uiLanguageChanged caches the new language and reloads', async () => {
    await openDevPanel();

    transport.emit('uiLanguageChanged', { language: 'ru' });

    expect(localStorage.getItem('devpanel.uiLanguage')).toBe('ru');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a rejected setUiLanguage shows the error in the current language', async () => {
    const page = await openDevPanel();

    languageButton(page, 'ru').click();
    await transport.fail(transport.lastCommand('setUiLanguage'), {
      code: 'uiLanguageNotSaved',
      params: {},
      details: 'EPERM: operation not permitted',
    });
    await fixture.whenStable();

    expect(page.querySelector('.errors')!.textContent).toContain('Could not save the language choice');
    expect(reload).not.toHaveBeenCalled();
  });
});
