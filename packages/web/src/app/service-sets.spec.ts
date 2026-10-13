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
