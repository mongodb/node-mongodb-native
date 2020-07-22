interface CoerceErrorOptions {
  id?: string,
  warn?: boolean
  typeSuffix?: string,
}

export class CoerceError extends Error {
  typeName?: string;
  id?: string;
  value: any;
  constructor(typeName?: string, value?: any, options?: CoerceErrorOptions) {
    const id = options?.id;
    typeName = options?.typeSuffix && typeName ? `${typeName} ${options.typeSuffix}` : typeName;
    const msg = CoerceError.createMessage(typeName, value, id);
    super(msg);
    this.typeName = typeName;
    this.value = value;
    this.id = id;
    if (options?.warn) this.warn();
  }
  static displayValue(value: any) {
    if (value === undefined) return '"undefined"';
    if (value === null) return '"null"';
    if (value === true) return '"true"';
    if (value === false) return '"false"';
    if (Array.isArray(value)) return '"[...]"';
    if (typeof value === 'object') return '"{...}"';
    return `${JSON.stringify(value)}`;
  }
  updateMessage(opt: { typeName?: any; value?: any; id?: string }) {
    if (opt.typeName) this.typeName = opt.typeName;
    if (typeof opt.value !== 'undefined') this.value = opt.value;
    if (opt.id) this.id = opt.id;
    return new CoerceError(this.typeName, this.value, opt);
  }
  static createMessage(typeName?: string, value?: any, id?: string): string {
    const prefix = 'Invalid type';
    const display = this.displayValue(value);
    if (typeName && display && id) {
      return `${prefix}: "${id}" with value ${display} is not valid "${typeName}"`;
    }
    if (typeName && display) return `${prefix}: value ${display} is not valid "${typeName}"`;
    if (typeName) return `${prefix}: not valid "${typeName}"`;
    return `${prefix}`;
  }
  warn() {
    console.warn(this.message);
  }
}

export class CoerceDeprecate extends Error {
  id: string;
  favor?: string;
  constructor(id: string, favor?: string) {
    const msg = CoerceDeprecate.createMessage(id, favor);
    super(msg);
    this.id = id;
    this.favor = favor;
  }
  static createMessage(id: string, favor?: string) {
    if (id && favor) {
      return `Deprecation notice: '${id}' is deprecated, please use '${favor}' instead`;
    }
    return `Deprecation notice: '${id}' is deprecated`;
  }
  warn() {
    console.warn(this.message);
  }
}

export class CoerceUnrecognized extends Error {
  id: string;
  constructor(id: string) {
    const msg = CoerceUnrecognized.createMessage(id);
    super(msg);
    this.id = id;
  }
  static createMessage(id: string) {
    return `Unrecognized notice: property '${id}' is not recognized`;
  }
  warn() {
    console.warn(this.message);
  }
}
