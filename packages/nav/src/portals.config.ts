/**
 * The four Summit portals. URLs resolve per environment so the bar works the
 * same locally and in production: no dead links in dev, no localhost in prod.
 */
const DEV_PORTS: Record<string, number> = {
  scheduler: 3010,
  clinician: 3004,
  employee: 3006,
  client: 3008,
};

const PROD_HOSTS: Record<string, string> = {
  scheduler: 'https://scheduler.summitclient.io',
  clinician: 'https://data.summitclient.io',
  employee: 'https://employee.summitclient.io',
  client: 'https://client.summitclient.io',
};

const isDev =
  typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';

function urlFor(key: string): string {
  return isDev ? `http://localhost:${DEV_PORTS[key]}` : PROD_HOSTS[key];
}

export const portals = [
  { key: 'scheduler', label: 'Scheduler', url: urlFor('scheduler') },
  { key: 'clinician', label: 'Clinician Portal', url: urlFor('clinician') },
  { key: 'employee', label: 'Employee Portal', url: urlFor('employee') },
  { key: 'client', label: 'Client Portal', url: urlFor('client') },
];
