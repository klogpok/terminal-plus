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

function findButton(root: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
}

function buttonIn(root: HTMLElement, text: string): HTMLButtonElement {
  const found = findButton(root, text);
  if (!found) throw new Error(`No "${text}" button in:\n${root.innerHTML}`);
  return found;
}

function field<T extends HTMLElement = HTMLInputElement>(root: HTMLElement, label: string): T {
  const found = root.querySelector<T>(`[aria-label="${label}"]`);
  if (!found) throw new Error(`No field "${label}" in:\n${root.innerHTML}`);
  return found;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function removeButton(root: HTMLElement, serviceName: string): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(`button[aria-label="Remove ${serviceName}"]`);
}

const site = aRepo({
  id: 's1',
  name: 'Site',
  configSource: 'local',
  services: [aService({ id: 'dev', name: 'dev', command: 'pnpm run dev' })],
  suggestions: [
    { id: 'dev', name: 'dev', command: 'pnpm run dev', preselected: true },
    { id: 'build', name: 'build', command: 'pnpm run build', preselected: false },
    { id: 'docs', name: 'docs', command: 'pnpm run docs', preselected: false },
  ],
});

describe('+ Add Service', () => {
  it('opens an inline form that offers the detected scripts not yet in the Local Config', async () => {
    await transport.connectWith({ repos: [site] });
    await stable();

    buttonIn(repoCard('s1'), '+ Add Service').click();
    await stable();

    const form = repoCard('s1').querySelector<HTMLFormElement>('form.add-service')!;
    expect(form).not.toBeNull();
    const pick = field<HTMLSelectElement>(form, 'Detected script');
    expect([...pick.options].map((o) => o.textContent!.trim())).toEqual([
      'My own command',
      'build — pnpm run build',
      'docs — pnpm run docs',
    ]);

    pick.value = pick.options[2]!.value;
    pick.dispatchEvent(new Event('change'));
    await stable();
    expect(field(form, 'Name').value).toBe('docs');
    expect(field(form, 'Command').value).toBe('pnpm run docs');

    const more = form.querySelector('details')!;
    expect(more.open).toBe(false);
    expect(more.querySelector('summary')!.textContent!.trim()).toBe('More');
    for (const label of ['Port', 'Address for the browser', 'Ready when the output contains']) {
      expect(more.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    }
    expect(more.textContent).toContain('Start these first:');
  });

  it('sends the Service with the optional fields and closes the form once it is added', async () => {
    await transport.connectWith({ repos: [site] });
    await stable();
    buttonIn(repoCard('s1'), '+ Add Service').click();
    await stable();
    const form = repoCard('s1').querySelector<HTMLFormElement>('form.add-service')!;

    expect(buttonIn(form, 'Add').disabled).toBe(true);
    type(field(form, 'Name'), 'Docs');
    type(field(form, 'Command'), 'node docs.js');
    type(field(form, 'Port'), '4100');
    type(field(form, 'Address for the browser'), 'http://localhost:4100');
    form.querySelector<HTMLInputElement>('input[type=checkbox][value="dev"]')!.click();
    await stable();
    buttonIn(form, 'Add').click();
    await stable();

    const command = transport.lastCommand('addLocalService');
    expect(command.payload).toEqual({
      repoId: 's1',
      service: { name: 'Docs', command: 'node docs.js', port: 4100, url: 'http://localhost:4100', dependsOn: ['dev'] },
    });
    await transport.reply(command, null);
    await stable();
    expect(repoCard('s1').querySelector('form.add-service')).toBeNull();
  });

  it('shows a rejected value next to its field and keeps the form open', async () => {
    await transport.connectWith({ repos: [site] });
    await stable();
    buttonIn(repoCard('s1'), '+ Add Service').click();
    await stable();
    const form = repoCard('s1').querySelector<HTMLFormElement>('form.add-service')!;
    type(field(form, 'Name'), 'dev');
    type(field(form, 'Command'), 'x');
    await stable();
    buttonIn(form, 'Add').click();
    await stable();

    await transport.fail(transport.lastCommand('addLocalService'), {
      code: 'serviceInvalid',
      params: { repoName: 'Site', field: 'name', problem: 'nameTaken', name: 'dev' },
      details: 'A Service named "dev" already exists',
    });
    await stable();

    expect(form.querySelector('[data-field-error="name"]')!.textContent).toContain(
      'A Service with this name already exists',
    );
    expect(repoCard('s1').querySelector('form.add-service')).not.toBeNull();
  });

  it('does not offer the first-save suggestions once the Local Config exists', async () => {
    await transport.connectWith({ repos: [site, { ...site, id: 's2', suggestions: [] }] });
    await stable();

    expect(findButton(repoCard('s1'), 'Save as Local Config')).toBeUndefined();
    expect(repoCard('s1').querySelector('input[type=checkbox]')).toBeNull();
    expect(repoCard('s2').textContent).not.toContain('Found nothing to run');
  });

  it('is offered next to the suggestions and when nothing was detected', async () => {
    await transport.connectWith({
      repos: [
        aRepo({ id: 'a', configSource: 'none', suggestions: site.suggestions! }),
        aRepo({ id: 'b', configSource: 'none', suggestions: [] }),
      ],
    });
    await stable();

    expect(repoCard('a').textContent).toContain('Save as Local Config');
    expect(findButton(repoCard('a'), '+ Add Service')).toBeDefined();
    expect(repoCard('b').textContent).toContain('Found nothing to run');
    expect(findButton(repoCard('b'), '+ Add Service')).toBeDefined();
  });
});

describe('a Repo with a Repo Config', () => {
  it('offers neither "+ Add Service" nor "Remove"', async () => {
    await transport.connectWith({
      repos: [aRepo({ id: 'b1', configSource: 'repo', services: [aService({ id: 'api', name: 'API' })] })],
    });
    await stable();

    expect(findButton(repoCard('b1'), '+ Add Service')).toBeUndefined();
    expect(removeButton(repoCard('b1'), 'API')).toBeNull();
  });
});

describe('Remove', () => {
  it('removes a stopped Service nobody depends on right away', async () => {
    await transport.connectWith({ repos: [site] });
    await stable();

    removeButton(repoCard('s1'), 'dev')!.click();
    await stable();

    expect(transport.lastCommand('removeLocalService').payload).toEqual({ repoId: 's1', serviceId: 'dev' });
  });

  it('asks before stopping and removing a running Service', async () => {
    await transport.connectWith({
      repos: [{ ...site, services: [aService({ id: 'dev', name: 'dev', status: 'running' })] }],
    });
    await stable();

    removeButton(repoCard('s1'), 'dev')!.click();
    await stable();
    expect(transport.commands('removeLocalService')).toEqual([]);
    const dialog = repoCard('s1').querySelector<HTMLElement>('[role=alertdialog]')!;
    expect(dialog.textContent).toContain('The Service is running — stop and remove it?');

    buttonIn(dialog, 'Cancel').click();
    await stable();
    expect(repoCard('s1').querySelector('[role=alertdialog]')).toBeNull();

    removeButton(repoCard('s1'), 'dev')!.click();
    await stable();
    buttonIn(repoCard('s1').querySelector<HTMLElement>('[role=alertdialog]')!, 'Remove').click();
    await stable();
    expect(transport.lastCommand('removeLocalService').payload).toEqual({ repoId: 's1', serviceId: 'dev' });
  });

  it('lists the Services that depend on the removed one', async () => {
    await transport.connectWith({
      repos: [
        {
          ...site,
          services: [
            aService({ id: 'db', name: 'Database' }),
            aService({ id: 'api', name: 'API', dependsOn: ['db'] }),
            aService({ id: 'jobs', name: 'Jobs', dependsOn: ['db'] }),
          ],
        },
      ],
    });
    await stable();

    removeButton(repoCard('s1'), 'Database')!.click();
    await stable();

    const dialog = repoCard('s1').querySelector<HTMLElement>('[role=alertdialog]')!;
    expect(dialog.textContent).toContain('Remove the Database Service?');
    expect(dialog.textContent).toContain('These Services will no longer wait for it: API, Jobs.');
  });

  it('is not offered for a Service already removed from the config', async () => {
    await transport.connectWith({
      repos: [{ ...site, services: [aService({ id: 'old', name: 'Old', status: 'running', removedFromConfig: true })] }],
    });
    await stable();

    expect(removeButton(repoCard('s1'), 'Old')).toBeNull();
  });
});
