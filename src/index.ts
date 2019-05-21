type Services = any;

interface Options {
  loadPath: ((languages: string | string[], namespaces: string | string[]) => string) | string;
  addPath: ((languages: string | string[], namespaces: string | string[]) => string) | string;
  multiSeparator: string;
  allowMultiLoading: boolean;
  parse: typeof JSON.parse;
  stringify: typeof JSON.stringify;
  fetch: typeof fetch | undefined;
  requestOptions: object;
}

type LoadCallback = (error: string, result: string | boolean | null) => void;

function getGlobal(property: string): (typeof fetch) | undefined {
  /* istanbul ignore next */
  if (typeof self !== 'undefined' && self && property in self) {
    // @ts-ignore
    return self[property];
  }

  /* istanbul ignore next */
  if (typeof window !== 'undefined' && window && property in window) {
    // @ts-ignore
    return window[property];
  }

  if (typeof global !== 'undefined' && global && property in global) {
    // @ts-ignore
    return global[property];
  }

  /* istanbul ignore next */
  if (typeof globalThis !== 'undefined' && globalThis) {
    // @ts-ignore
    return globalThis[property];
  }

  return undefined;
}

const defaults: Options = {
  loadPath: '/locales/{{lng}}/{{ns}}.json',
  addPath: '/locales/add/{{lng}}/{{ns}}',
  multiSeparator: '+',
  allowMultiLoading: false,
  parse: JSON.parse,
  stringify: JSON.stringify,
  fetch: getGlobal('fetch'),
  requestOptions: {},
};

function arrify(val: string | string[]): string[] {
  return Array.isArray(val) ? val : [val];
}

function normalize<T extends unknown[]>(funcOrVal: ((...args: T) => string) | string, ...args: T): string {
  return typeof funcOrVal === 'function' ? funcOrVal(...args) : funcOrVal;
}

class BackendError extends Error {
  public retry: boolean | null = null;

  constructor(message: string, retry = false) {
    super(message);

    this.retry = retry;
  }
}

class Backend {
  static type = 'backend';

  options: Options = {} as Options;

  services: Services;

  type = 'backend';

  constructor(services: Services, options: Options) {
    this.init(services, options);
  }

  init(services: Services, options: Options = {} as Options) {
    this.services = services;

    this.options = {
      ...defaults,
      ...this.options,
      ...options,
    };
  }

  getLoadPath(languages: string | string[], namespaces: string | string[]) {
    return normalize(this.options.loadPath, languages, namespaces);
  }

  read(language: string, namespace: string, callback: LoadCallback) {
    const loadPath = this.getLoadPath(language, namespace);
    const url = this.services.interpolator.interpolate(loadPath, { lng: language, ns: namespace });

    this.loadUrl(url, callback);
  }

  readMulti(languages: string[], namespaces: string[], callback: LoadCallback) {
    const loadPath = this.getLoadPath(languages, namespaces);
    const { multiSeparator } = this.options;

    const url = this.services.interpolator.interpolate(loadPath, {
      lng: languages.join(multiSeparator),
      ns: namespaces.join(multiSeparator),
    });

    this.loadUrl(url, callback);
  }

  async loadUrl(url: string, callback: LoadCallback) {
    const { fetch, requestOptions, parse } = this.options;

    try {
      let response: Response;
      try {
        response = await fetch(url, requestOptions);
      } catch (_) {
        throw new BackendError(`failed making request ${url}`);
      }
      if (!response.ok) {
        const { status } = response;
        const retry = status >= 500 && status < 600; // don't retry for 4xx codes

        throw new BackendError(`failed loading ${url}`, retry);
      }

      const data = await response.text();

      try {
        return callback(null, parse(data));
      } catch (_) {
        throw new BackendError(`failed parsing ${url} to json`, false);
      }
    } catch (e) {
      if (e instanceof BackendError) {
        return callback(e.message, e.retry);
      }
    }
  }

  create(languages: string | string[], namespace: string, key: string, fallbackValue: string = '') {
    const payload = {
      [key]: fallbackValue,
    };

    arrify(languages).forEach(lng => {
      const { addPath, requestOptions, fetch, stringify } = this.options;

      const url = this.services.interpolator.interpolate(addPath, { lng, ns: namespace });

      try {
        fetch(url, {
          method: 'POST',
          body: stringify(payload),
          ...requestOptions,
        });
      } catch (ex) {
        console.error(ex);
      }
    });
  }
}

export default Backend;
