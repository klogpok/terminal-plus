import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ServiceSetView } from '@devpanel/shared';
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

function buttonIn(root: ParentNode, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === text || b.textContent?.trim() === text,
  );
  if (!found) throw new Error(`No button "${text}" in:\n${(root as HTMLElement).innerHTML ?? ''}`);
  return found;
}

function field(root: ParentNode, label: string): HTMLInputElement {
  const found = root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!found) throw new Error(`No field "${label}" in:\n${(root as HTMLElement).innerHTML ?? ''}`);
  return found;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function topbar(): HTMLElement {
  return page.querySelector<HTMLElement>('.topbar')!;
}

function menu(): HTMLElement | null {
  return page.querySelector<HTMLElement>('[role=menu]');
}

function dialog(): HTMLElement | null {
  return page.querySelector<HTMLElement>('[role=dialog]');
}

async function openMenu(): Promise<HTMLElement> {
  buttonIn(topbar(), 'Service Sets').click();
  await fixture.whenStable();
  return menu()!;
}

async function openNewDialog(): Promise<HTMLElement> {
  buttonIn(await openMenu(), 'New Service Set…').click();
  await fixture.whenStable();
  return dialog()!;
}

function checked(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
    .filter((c) => c.checked)
    .map((c) => c.getAttribute('aria-label')!);
}

const billing = aRepo({
  id: 'b1',
  name: 'Billing',
  color: '#22c55e',
  services: [
    aService({ id: 'api', name: 'API', status: 'running' }),
    aService({ id: 'worker', name: 'Worker', status: 'stopped' }),
  ],
});
const shop = aRepo({ id: 's1', name: 'Shop', services: [aService({ id: 'web', name: 'Web', status: 'running' })] });

function aSet(id: string, name: string): ServiceSetView {
  return {
    id,
    name,
    services: [{ ref: { repoId: 'b1', serviceId: 'api' }, repoName: 'Billing', serviceName: 'API', found: true }],
  };
}

describe('Service Sets menu', () => {
  it('lists the Service Sets from the snapshot and follows changes from the Server', async () => {
    await transport.connectWith({ repos: [billing], serviceSets: [aSet('x', 'Project X'), aSet('s', 'Support')] });
    await fixture.whenStable();

    const opened = await openMenu();
    expect(buttonIn(topbar(), 'Service Sets').getAttribute('aria-expanded')).toBe('true');
    expect([...opened.querySelectorAll('[data-service-set-id]')].map((e) => e.textContent?.trim())).toEqual([
      'Project X',
      'Support',
    ]);

    transport.emit('serviceSetsChanged', { serviceSets: [aSet('s', 'Support')] });
    await fixture.whenStable();
    expect([...menu()!.querySelectorAll('[data-service-set-id]')].map((e) => e.textContent?.trim())).toEqual([
      'Support',
    ]);
  });

  it('closes on Escape', async () => {
    await transport.connectWith({ repos: [billing] });
    await fixture.whenStable();
    const opened = await openMenu();

    opened.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(menu()).toBeNull();
    expect(buttonIn(topbar(), 'Service Sets').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Starting a Service Set', () => {
  function errorsText(): string {
    return page.querySelector('.errors')?.textContent ?? '';
  }

  it('clicking a Service Set starts it and closes the menu; success shows nothing', async () => {
    await transport.connectWith({ repos: [billing], serviceSets: [aSet('x', 'Project X')] });
    await fixture.whenStable();

    buttonIn(await openMenu(), 'Project X').click();
    await fixture.whenStable();

    const sent = transport.lastCommand('startServiceSet');
    expect(sent.payload).toEqual({ id: 'x' });
    expect(menu()).toBeNull();
    await transport.reply(sent, { notFound: [], notRunning: [] });
    await fixture.whenStable();
    expect(errorsText()).toBe('');
  });

  it('shows one plain-language message from the start report, naming the Services that did not start, once', async () => {
    await transport.connectWith({ repos: [billing, shop], serviceSets: [aSet('x', 'Project X')] });
    await fixture.whenStable();
    buttonIn(await openMenu(), 'Project X').click();
    await fixture.whenStable();
    const api = { repoId: 'b1', serviceId: 'api' };
    const web = { repoId: 's1', serviceId: 'web' };

    transport.emit('serviceSetStartReported', {
      id: 'x',
      name: 'Project X',
      notFound: [],
      notRunning: [
        { ref: api, repoName: 'Billing', serviceName: 'API' },
        { ref: web, repoName: 'Shop', serviceName: 'Web' },
      ],
    });
    await transport.reply(transport.lastCommand('startServiceSet'), { notFound: [], notRunning: [api, web] });
    await fixture.whenStable();

    expect(page.querySelectorAll('.errors dp-error-message')).toHaveLength(1);
    expect(errorsText()).toContain(
      'The Service Set "Project X" did not start completely. Not running: API in Repo Billing, Web in Repo Shop.',
    );
  });

  it('names Services that were not found', async () => {
    await transport.connectWith({ repos: [billing] });
    await fixture.whenStable();

    transport.emit('serviceSetStartReported', {
      id: 'x',
      name: 'Project X',
      notFound: [{ ref: { repoId: 'gone', serviceId: 'db' }, repoName: 'Old', serviceName: 'DB' }],
      notRunning: [],
    });
    await fixture.whenStable();

    expect(errorsText()).toContain('Not found: DB in Repo Old.');
  });

  it('a Service Set deleted meanwhile is explained in plain language', async () => {
    await transport.connectWith({ repos: [billing], serviceSets: [aSet('x', 'Project X')] });
    await fixture.whenStable();
    buttonIn(await openMenu(), 'Project X').click();
    await fixture.whenStable();

    await transport.fail(transport.lastCommand('startServiceSet'), {
      code: 'serviceSetNotFound',
      params: {},
      details: 'No Service Set has the id "x"',
    });
    await fixture.whenStable();

    expect(errorsText()).toContain('This Service Set no longer exists.');
  });
});

describe('New Service Set dialog', () => {
  it('lists every Service grouped by Repo, labelled with Repo and Service, with running ones pre-checked', async () => {
    await transport.connectWith({ repos: [billing, shop] });
    await fixture.whenStable();

    const form = await openNewDialog();

    expect([...form.querySelectorAll('fieldset legend')].map((l) => l.textContent?.trim())).toEqual(['Billing', 'Shop']);
    expect([...form.querySelectorAll('input[type=checkbox]')].map((c) => c.getAttribute('aria-label'))).toEqual([
      'API in Repo Billing',
      'Worker in Repo Billing',
      'Web in Repo Shop',
    ]);
    expect(checked(form)).toEqual(['API in Repo Billing', 'Web in Repo Shop']);
    expect(menu()).toBeNull();
  });

  it('saves the name and the checked Services, then closes; the menu shows the new Set', async () => {
    await transport.connectWith({ repos: [billing, shop] });
    await fixture.whenStable();
    const form = await openNewDialog();

    type(field(form, 'Name'), 'Project X');
    field(form, 'Worker in Repo Billing').click();
    field(form, 'Web in Repo Shop').click();
    await fixture.whenStable();
    buttonIn(form, 'Save').click();
    await fixture.whenStable();

    const command = transport.lastCommand('createServiceSet');
    expect(command.payload).toEqual({
      name: 'Project X',
      services: [
        { repoId: 'b1', serviceId: 'api' },
        { repoId: 'b1', serviceId: 'worker' },
      ],
    });
    await transport.reply(command, aSet('x', 'Project X'));
    await fixture.whenStable();

    expect(dialog()).toBeNull();
    const opened = await openMenu();
    expect([...opened.querySelectorAll('[data-service-set-id]')].map((e) => e.textContent?.trim())).toEqual([
      'Project X',
    ]);
  });

  it('shows a refused name next to the name field and keeps the dialog open', async () => {
    await transport.connectWith({ repos: [billing] });
    await fixture.whenStable();
    const form = await openNewDialog();

    type(field(form, 'Name'), 'project x');
    buttonIn(form, 'Save').click();
    await transport.fail(transport.lastCommand('createServiceSet'), {
      code: 'serviceSetNameTaken',
      params: { name: 'project x' },
      details: 'A Service Set named "project x" already exists',
    });
    await fixture.whenStable();

    expect(form.querySelector('[data-field-error="name"]')?.textContent).toContain(
      'A Service Set named "project x" already exists. Choose another name.',
    );
    expect(dialog()).not.toBeNull();
  });

  it('shows "no Services" next to the Services', async () => {
    await transport.connectWith({ repos: [billing] });
    await fixture.whenStable();
    const form = await openNewDialog();

    type(field(form, 'Name'), 'Project X');
    field(form, 'API in Repo Billing').click();
    await fixture.whenStable();
    buttonIn(form, 'Save').click();
    expect(transport.lastCommand('createServiceSet').payload.services).toEqual([]);
    await transport.fail(transport.lastCommand('createServiceSet'), {
      code: 'serviceSetEmpty',
      params: {},
      details: 'A Service Set needs at least one Service',
    });
    await fixture.whenStable();

    expect(form.querySelector('[data-field-error="services"]')?.textContent).toContain('Check at least one Service.');
  });

  it('Cancel closes without saving', async () => {
    await transport.connectWith({ repos: [billing] });
    await fixture.whenStable();
    const form = await openNewDialog();

    buttonIn(form, 'Cancel').click();
    await fixture.whenStable();

    expect(dialog()).toBeNull();
    expect(transport.commands('createServiceSet')).toEqual([]);
  });
});

describe('Edit Service Set dialog', () => {
  /** Project X = Billing Worker + Shop Web (Billing API runs but is not in the Set). */
  const projectX: ServiceSetView = {
    id: 'x',
    name: 'Project X',
    services: [
      { ref: { repoId: 'b1', serviceId: 'worker' }, repoName: 'Billing', serviceName: 'Worker', found: true },
      { ref: { repoId: 's1', serviceId: 'web' }, repoName: 'Shop', serviceName: 'Web', found: true },
    ],
  };

  async function openEditDialog(name: string): Promise<HTMLElement> {
    buttonIn(await openMenu(), `Edit ${name}`).click();
    await fixture.whenStable();
    return dialog()!;
  }

  beforeEach(async () => {
    await transport.connectWith({ repos: [billing, shop], serviceSets: [projectX, aSet('s', 'Support')] });
    await fixture.whenStable();
  });

  it('opens from an edit action next to each Set, filled with its name and its Services', async () => {
    const opened = await openMenu();
    expect([...opened.querySelectorAll('[role=menuitem]')].map((e) => e.getAttribute('aria-label') ?? e.textContent?.trim())).toEqual([
      'Project X',
      'Edit Project X',
      'Support',
      'Edit Support',
      'New Service Set…',
    ]);

    buttonIn(opened, 'Edit Project X').click();
    await fixture.whenStable();
    const form = dialog()!;

    expect(form.querySelector('.title')?.textContent?.trim()).toBe('Edit Service Set');
    expect(field(form, 'Name').value).toBe('Project X');
    expect(checked(form)).toEqual(['Worker in Repo Billing', 'Web in Repo Shop']);
    expect(menu()).toBeNull();
  });

  it('saves the new name and Services under the same id, then closes; the menu shows the change', async () => {
    const form = await openEditDialog('Project X');

    type(field(form, 'Name'), 'Project Y');
    field(form, 'Web in Repo Shop').click();
    await fixture.whenStable();
    buttonIn(form, 'Save').click();
    await fixture.whenStable();

    const command = transport.lastCommand('updateServiceSet');
    expect(command.payload).toEqual({ id: 'x', name: 'Project Y', services: [{ repoId: 'b1', serviceId: 'worker' }] });
    expect(transport.commands('createServiceSet')).toEqual([]);
    await transport.reply(command, { ...projectX, name: 'Project Y' });
    await fixture.whenStable();

    expect(dialog()).toBeNull();
    expect([...(await openMenu()).querySelectorAll('[data-service-set-id]')].map((e) => e.textContent?.trim())).toEqual([
      'Project Y',
      'Support',
    ]);
  });

  it('keeps an entry that is not found when saving', async () => {
    const gone = { ref: { repoId: 'old', serviceId: 'db' }, repoName: 'Old', serviceName: 'DB', found: false };
    transport.emit('serviceSetsChanged', { serviceSets: [{ ...projectX, services: [...projectX.services, gone] }] });
    await fixture.whenStable();
    const form = await openEditDialog('Project X');

    buttonIn(form, 'Save').click();
    await fixture.whenStable();

    expect(transport.lastCommand('updateServiceSet').payload.services).toEqual([
      { repoId: 'b1', serviceId: 'worker' },
      { repoId: 's1', serviceId: 'web' },
      { repoId: 'old', serviceId: 'db' },
    ]);
  });

  it('shows a refused name next to the name field', async () => {
    const form = await openEditDialog('Project X');

    type(field(form, 'Name'), 'support');
    buttonIn(form, 'Save').click();
    await transport.fail(transport.lastCommand('updateServiceSet'), {
      code: 'serviceSetNameTaken',
      params: { name: 'support' },
      details: 'A Service Set named "support" already exists',
    });
    await fixture.whenStable();

    expect(form.querySelector('[data-field-error="name"]')?.textContent).toContain('A Service Set named "support" already exists.');
    expect(dialog()).not.toBeNull();
  });

  it('says so when the Set no longer exists', async () => {
    const form = await openEditDialog('Project X');

    buttonIn(form, 'Save').click();
    await transport.fail(transport.lastCommand('updateServiceSet'), {
      code: 'serviceSetNotFound',
      params: {},
      details: 'Service Set x not found',
    });
    await fixture.whenStable();

    expect(form.textContent).toContain('This Service Set no longer exists.');
    expect(dialog()).not.toBeNull();
  });

  it('deletes the Set only after confirmation', async () => {
    const form = await openEditDialog('Project X');

    buttonIn(form, 'Delete').click();
    await fixture.whenStable();
    expect(form.textContent).toContain('Delete the Service Set "Project X"?');
    expect(transport.commands('deleteServiceSet')).toEqual([]);
    buttonIn(form, 'Keep it').click();
    await fixture.whenStable();
    expect(form.textContent).not.toContain('Delete the Service Set "Project X"?');

    buttonIn(form, 'Delete').click();
    await fixture.whenStable();
    buttonIn(form, 'Yes, delete').click();
    await fixture.whenStable();

    const command = transport.lastCommand('deleteServiceSet');
    expect(command.payload).toEqual({ id: 'x' });
    await transport.reply(command, null);
    await fixture.whenStable();

    expect(dialog()).toBeNull();
    expect([...(await openMenu()).querySelectorAll('[data-service-set-id]')].map((e) => e.textContent?.trim())).toEqual([
      'Support',
    ]);
  });

  it('has no Delete button for a new Set', async () => {
    const form = await openNewDialog();

    expect([...form.querySelectorAll('button')].map((b) => b.textContent?.trim())).not.toContain('Delete');
    expect(form.querySelector('.title')?.textContent?.trim()).toBe('New Service Set');
  });
});
