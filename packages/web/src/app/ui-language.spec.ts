import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { BACKEND_TRANSPORT } from './backend/backend-transport';
import { FakeTransport } from './backend/fake-transport';
import { loadUiLanguage } from './ui-language';

/** Loads the UI Language the way main.ts does at page load, then renders the app. */
async function openDevPanel(): Promise<HTMLElement> {
  loadUiLanguage();
  const transport = new FakeTransport();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [{ provide: BACKEND_TRANSPORT, useValue: transport }],
  });
  const fixture = TestBed.createComponent(App);
  await transport.connectWith({ repos: [] });
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
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

    const page = await openDevPanel();

    expect(page.querySelector('.exit-button')!.textContent).toContain('Выйти из DevPanel');
    expect(page.querySelector('[role="separator"]')!.getAttribute('aria-label')).toBe('Ширина списка репо');
    expect(document.documentElement.lang).toBe('ru');
    expect(document.title).toBe('DevPanel');
  });
});
