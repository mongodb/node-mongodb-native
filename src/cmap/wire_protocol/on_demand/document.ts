import { BSONError } from 'bson';

import {
  BSON,
  type BSONElement,
  type BSONSerializeOptions,
  parseToElementsToArray
} from '../../../bson';
import { StringFinder } from './string_finder';

// eslint-disable-next-line no-restricted-syntax
const enum BSONElementOffset {
  nameOffset = 1
}

/** @internal */
export class OnDemandDocument {
  private readonly existenceOf = Object.create(null);
  private readonly elementOf = Object.create(null);
  private readonly elements: Array<BSONElement | null>;

  /** The number of elements in the BSON document */
  public readonly length: number;

  constructor(
    /** BSON bytes, this document begins at offset */
    protected readonly bson: Uint8Array,
    /** The start of the document */
    private readonly offset = 0,
    /** If this is an embedded document, indicates if this was a BSON array */
    public readonly isArray = false
  ) {
    this.elements = parseToElementsToArray(this.bson, offset);
    this.length = this.elements.length;
  }

  private getElement(name: string): BSONElement | null {
    if (this.elementOf[name] != null) {
      return this.elementOf[name];
    }

    for (let index = 0; index < this.elements.length; index++) {
      const element = this.elements[index];

      if (
        element != null &&
        StringFinder.includes(this.bson, name, element[BSONElementOffset.nameOffset])
      ) {
        this.elementOf[name] = element;
        this.elements[index] = null;
        return this.elementOf[name];
      }
    }

    return null;
  }

  public hasElement(name: string): boolean {
    if (name in this.existenceOf) return this.existenceOf[name];
    this.existenceOf[name] = this.getElement(name) != null;
    return this.existenceOf[name];
  }

  public toObject(options?: BSONSerializeOptions): Record<string, any> {
    return BSON.deserialize(this.bson, {
      ...options,
      index: this.offset,
      allowObjectSmallerThanBufferSize: true
    });
  }

  public toArray(options?: BSONSerializeOptions): Array<any> {
    if (!this.isArray) {
      throw new BSONError('Unexpected conversion of non-array value to array');
    }
    return Array.from(Object.values(this.toObject(options)));
  }
}
