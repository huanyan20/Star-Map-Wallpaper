function resolveHost(host) {
  if (host) return host;
  if (typeof window !== 'undefined') return window;
  return globalThis;
}

export function createSkyRuntime(host) {
  const runtimeHost = resolveHost(host);
  const registry = new Map();

  const api = {
    host: runtimeHost,
    get(key) {
      if (registry.has(key)) return registry.get(key);
      if (Object.prototype.hasOwnProperty.call(runtimeHost, key)) {
        return runtimeHost[key];
      }
      return undefined;
    },
    set(key, value) {
      registry.set(key, value);
      runtimeHost[key] = value;
      return value;
    },
    has(key) {
      return registry.has(key) || Object.prototype.hasOwnProperty.call(runtimeHost, key);
    },
    delete(key) {
      registry.delete(key);
      delete runtimeHost[key];
      return true;
    }
  };

  return new Proxy(api, {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      return target.get(String(prop));
    },
    set(target, prop, value, receiver) {
      if (prop in target) {
        return Reflect.set(target, prop, value, receiver);
      }
      target.set(String(prop), value);
      return true;
    },
    has(target, prop) {
      if (prop in target) return true;
      return target.has(String(prop));
    }
  });
}

export const skyRuntime = createSkyRuntime();

if (typeof window !== 'undefined') {
  window.skyRuntime = skyRuntime;
  window.__skyRuntime = skyRuntime;
}

export function getSkyRuntime(host) {
  return createSkyRuntime(host);
}
