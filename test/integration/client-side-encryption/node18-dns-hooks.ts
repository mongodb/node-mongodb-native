import { setDefaultResultOrder } from 'dns';

export function node18BeforeHook() {
  if (process.version.startsWith('v18')) {
    setDefaultResultOrder('ipv4first');
  }
}

export function node18AfterHook() {
  if (process.version.startsWith('v18')) {
    setDefaultResultOrder('verbatim');
  }
}
