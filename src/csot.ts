import { type Document } from 'bson';
import { clearTimeout, setTimeout } from 'timers';

import { type MongoClientOptions } from './mongo_client';
import { type CommandOperationOptions } from './operations/command';
import { type AbstractOperation } from './operations/operation';
import { type ClientSession } from './sessions';
import { type List, now } from './utils';

export class Context {
  operations?: List<AbstractOperation>;
  session?: ClientSession;

  /** The average rtt of the selected server, at the point of server selection. */
  rtt?: number;

  constructor(
    private options: CommandOperationOptions & MongoClientOptions,
    public timeoutController = TimeoutController.create(options)
  ) {}

  static create(options: Document): Context {
    return 'context' in options && options.context instanceof Context
      ? options.context
      : new Context(options as any);
  }
}

type TimeoutOptions = Pick<MongoClientOptions, 'waitQueueTimeoutMS' | 'serverSelectionTimeoutMS'>;

export class CustomTimeoutController extends AbortController {
  private timeoutId: NodeJS.Timeout;
  constructor(timeout: number) {
    super();

    this.timeoutId = setTimeout(() => {
      this.abort();
    }, timeout);
  }

  clear() {
    clearTimeout(this.timeoutId);
  }
}

export abstract class TimeoutController {
  abstract serverSelectionTimeoutMS?: number | undefined;

  static create(options: TimeoutOptions): TimeoutController {
    return new LegacyTimeoutController(options);
  }

  abstract timeoutSignalFor(
    component: 'server selection' | 'connection checkout'
  ): CustomTimeoutController | undefined;
}

export class LegacyTimeoutController extends TimeoutController {
  get serverSelectionTimeoutMS(): number | undefined {
    return this.options.serverSelectionTimeoutMS;
  }

  override timeoutSignalFor(
    _component: 'server selection' | 'connection checkout'
  ): CustomTimeoutController | undefined {
    switch (_component) {
      case 'connection checkout':
        return this.options.waitQueueTimeoutMS
          ? new CustomTimeoutController(this.options.waitQueueTimeoutMS)
          : undefined;
      case 'server selection':
        return this.options.serverSelectionTimeoutMS
          ? new CustomTimeoutController(this.options.serverSelectionTimeoutMS)
          : undefined;
    }
  }

  constructor(private options: TimeoutOptions) {
    super();
  }
}

function cacheValue() {
  let value: any = { triggered: false };
  return function (target: any, key: any) {
    if (value.triggered) {
      return value.value;
    }

    value = { triggered: true, value: target[key] };
    return value.value;
  };
}

export class CSOTTimeoutController extends TimeoutController {
  get hasTimedOut(): boolean {
    return this.remainingTimeoutMS < 0;
  }

  get remainingTimeoutMS(): number {
    return this.start + this.timeoutMS - now();
  }

  get computedServerSelectionTimeout(): number {
    // TODO: this needs to be cached
    return 3;
  }

  override timeoutSignalFor(
    component: 'server selection' | 'connection checkout'
  ): CustomTimeoutController | undefined {
    switch (component) {
      case 'connection checkout':
        return this.options.waitQueueTimeoutMS
          ? new CustomTimeoutController(this.options.waitQueueTimeoutMS)
          : undefined;
      case 'server selection':
        return this.options.serverSelectionTimeoutMS
          ? new CustomTimeoutController(this.options.serverSelectionTimeoutMS)
          : undefined;
    }
  }

  refresh() {
    this.start = now();
  }

  constructor(
    private options: TimeoutOptions & { timeoutMS: number },
    private readonly timeoutMS = options.timeoutMS,
    private start = now(),
    override serverSelectionTimeoutMS = options.serverSelectionTimeoutMS
  ) {
    super();
  }
}
