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

function button(root: ParentNode, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label);
  if (!found) throw new Error(`No button "${label}" in:\n${(root as HTMLElement).innerHTML ?? ''}`);
  return found;
}

function repoHeader(repoId: string): HTMLElement {
  return page.querySelector<HTMLElement>(`[data-repo-id="${repoId}"] dp-repo-header`)!;
}

const billing = aRepo({
  id: 'b1',
  name: 'Billing',
  services: [
    aService({ id: 'api', name: 'API', status: 'stopped', dependsOn: ['db'] }),
    aService({ id: 'db', name: 'DB', status: 'running' }),
  ],
});
const docs = aRepo({ id: 'd1', name: 'Docs', services: [aService({ id: 'site', status: 'running' })] });

describe('Start all / Stop all', () => {
  it('the Repo header has "Start all" and "Stop all" for that Repo', async () => {
    await transport.connectWith({ repos: [billing, docs] });
    await fixture.whenStable();

    button(repoHeader('b1'), 'Start all in Repo Billing').click();
    expect(transport.lastCommand('startAll').payload).toEqual({ repoId: 'b1' });

    button(repoHeader('b1'), 'Stop all in Repo Billing').click();
    expect(transport.lastCommand('stopAll').payload).toEqual({ repoId: 'b1' });
  });

  it('"Start all" is disabled when every Service already runs; "Stop all" when none runs', async () => {
    const allRunning = aRepo({ id: 'r1', name: 'R1', services: [aService({ id: 'a', status: 'running' })] });
    const allStopped = aRepo({ id: 'r2', name: 'R2', services: [aService({ id: 'b', status: 'crashed' })] });
    await transport.connectWith({ repos: [allRunning, allStopped] });
    await fixture.whenStable();

    expect(button(repoHeader('r1'), 'Start all in Repo R1').disabled).toBe(true);
    expect(button(repoHeader('r1'), 'Stop all in Repo R1').disabled).toBe(false);
    expect(button(repoHeader('r2'), 'Start all in Repo R2').disabled).toBe(false);
    expect(button(repoHeader('r2'), 'Stop all in Repo R2').disabled).toBe(true);
  });

  it('the top bar has "Stop everything in all Repos"', async () => {
    await transport.connectWith({ repos: [billing, docs] });
    await fixture.whenStable();

    button(page.querySelector('.topbar')!, 'Stop everything in all Repos').click();
    expect(transport.lastCommand('stopAllRepos').payload).toEqual({});
  });

  it('a failed dependency is explained in plain language, naming the dependency', async () => {
    await transport.connectWith({ repos: [billing] });
    await fixture.whenStable();

    button(page, 'Start API').click();
    await transport.fail(transport.lastCommand('startService'), {
      code: 'dependencyFailed',
      params: { repoName: 'Billing', serviceName: 'API', dependencyName: 'DB', dependencyStatus: 'crashed' },
      details: 'Service "api" was not started: its dependency "db" is crashed, not running',
    });
    await fixture.whenStable();

    expect(page.querySelector('.errors')!.textContent).toContain(
      'The API Service in the Billing Repo did not start: the DB Service has to run first, but it crashed.',
    );
  });
});
