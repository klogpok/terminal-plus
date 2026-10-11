import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { App } from './app';
import { BACKEND_TRANSPORT } from './backend/backend-transport';
import { FakeTransport } from './backend/fake-transport';
import { aRepo, aService } from './backend/test-data';

let transport: FakeTransport;
let fixture: ComponentFixture<App>;
let page: HTMLElement;

beforeEach(async () => {
  transport = new FakeTransport();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [{ provide: BACKEND_TRANSPORT, useValue: transport }],
  });
  fixture = TestBed.createComponent(App);
  page = fixture.nativeElement as HTMLElement;
  await fixture.whenStable();
});

async function stable(): Promise<void> {
  await fixture.whenStable();
}

function repoCard(repoId: string): HTMLElement {
  const card = page.querySelector<HTMLElement>(`[data-repo-id="${repoId}"]`);
  if (!card) throw new Error(`No Repo ${repoId} in:\n${page.innerHTML}`);
  return card;
}

function buttonIn(root: HTMLElement, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`No "${text}" button in:\n${root.innerHTML}`);
  return found;
}

const site = aRepo({
  id: 's1',
  name: 'Site',
  configSource: 'none',
  suggestions: [
    { id: 'dev', name: 'dev', command: 'pnpm run dev', preselected: true },
    { id: 'build', name: 'build', command: 'pnpm run build', preselected: false },
  ],
});

describe('auto-detected Services', () => {
  it('shows suggestions with checkboxes and saves the ticked ones as a Local Config', async () => {
    await transport.connectWith({ repos: [site] });
    await stable();

    const boxes = [...repoCard('s1').querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
    expect(boxes.map((b) => [b.closest('label')!.textContent!.trim(), b.checked])).toEqual([
      ['dev — pnpm run dev', true],
      ['build — pnpm run build', false],
    ]);

    boxes[0]!.click();
    boxes[1]!.click();
    buttonIn(repoCard('s1'), 'Save as Local Config').click();
    await stable();

    expect(transport.lastCommand('saveLocalConfig').payload).toEqual({
      repoId: 's1',
      services: [{ id: 'build', name: 'build', command: 'pnpm run build' }],
    });
  });

  it('cannot save when nothing is ticked', async () => {
    await transport.connectWith({
      repos: [{ ...site, suggestions: site.suggestions!.map((s) => ({ ...s, preselected: false })) }],
    });
    await stable();
    expect(buttonIn(repoCard('s1'), 'Save as Local Config').disabled).toBe(true);
  });

  it('says so when nothing could be detected', async () => {
    await transport.connectWith({ repos: [{ ...site, suggestions: [] }] });
    await stable();
    expect(repoCard('s1').textContent).toContain('Found nothing to run');
  });

  it('replaces the Repo when its config changes', async () => {
    await transport.connectWith({ repos: [site] });
    await stable();

    transport.emit('configChanged', {
      repo: aRepo({ id: 's1', name: 'Site', configSource: 'local', services: [aService({ id: 'dev', name: 'dev' })] }),
    });
    await stable();

    expect(repoCard('s1').querySelector('input[type=checkbox]')).toBeNull();
    expect(repoCard('s1').querySelector('[data-service-id="dev"]')).not.toBeNull();
  });
});

describe('config changes', () => {
  it('flags running Services whose config changed and Services removed from the config', async () => {
    await transport.connectWith({
      repos: [
        aRepo({
          id: 'b1',
          name: 'Billing',
          services: [
            aService({ id: 'api', name: 'API', status: 'running', configChanged: true }),
            aService({ id: 'job', name: 'Job', status: 'running', removedFromConfig: true }),
            aService({ id: 'web', name: 'Web' }),
          ],
        }),
      ],
    });
    await stable();

    const row = (id: string) => repoCard('b1').querySelector<HTMLElement>(`[data-service-id="${id}"]`)!;
    expect(row('api').textContent).toContain('Its config changed — restart it');
    expect(row('job').textContent).toContain('Removed from the config');
    expect(row('web').textContent).not.toContain('config changed');
  });

  it('offers to delete an unused Local Config once a Repo Config exists', async () => {
    await transport.connectWith({
      repos: [aRepo({ id: 'b1', name: 'Billing', configSource: 'repo', unusedLocalConfig: true })],
    });
    await stable();

    expect(repoCard('b1').textContent).toContain('Your Local Config is no longer used');
    buttonIn(repoCard('b1'), 'Delete Local Config').click();
    await stable();
    expect(transport.lastCommand('deleteLocalConfig').payload).toEqual({ repoId: 'b1' });
  });

  it('explains an invalid config in plain language, noting that its previous version still works', async () => {
    await transport.connectWith({
      repos: [
        aRepo({
          id: 'b1',
          name: 'Billing',
          configError: '.devpanel.yml is invalid: services.1.id: Duplicate Service id "api"',
          services: [aService({ id: 'api' })],
        }),
      ],
    });
    await stable();

    const alert = repoCard('b1').querySelector<HTMLElement>('[role=alert]')!;
    expect(alert.textContent).toContain('The Repo Config of the Billing Repo has a mistake');
    expect(alert.textContent).toContain('its previous version stays in use');
    expect(alert.querySelector('pre')!.textContent).toContain('Duplicate Service id "api"');
  });
});
