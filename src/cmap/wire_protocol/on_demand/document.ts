import {
  Binary,
  BSON,
  type BSONElement,
  BSONError,
  type BSONSerializeOptions,
  BSONType,
  getBigInt64LE,
  getInt32LE,
  ObjectId,
  parseToElementsToArray,
  Timestamp,
  toUTF8
} from '../../../bson';
import { StringFinder } from './string_finder';

// eslint-disable-next-line no-restricted-syntax
const enum BSONElementOffset {
  type = 0,
  nameOffset = 1,
  nameLength = 2,
  offset = 3,
  length = 4
}

export type JSTypeOf = {
  [BSONType.int]: number;
  [BSONType.long]: bigint;
  [BSONType.timestamp]: Timestamp;
  [BSONType.binData]: Binary;
  [BSONType.bool]: boolean;
  [BSONType.objectId]: ObjectId;
  [BSONType.string]: string;
  [BSONType.date]: Date;
  [BSONType.object]: OnDemandDocument;
  [BSONType.array]: OnDemandDocument;
};

/** @internal */
export class OnDemandDocument {
  private readonly existenceOf: Record<string, boolean> = Object.create(null);
  private readonly elementOf: Record<string, BSONElement> = Object.create(null);
  private readonly valueOf: Record<string, any> = Object.create(null);
  private readonly indexFound: Record<number, boolean> = Object.create(null);

  private readonly elements: BSONElement[];

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
    if (this.existenceOf[name] === false) return null;

    if (this.elementOf[name] != null) {
      return this.elementOf[name];
    }

    for (let index = 0; index < this.elements.length; index++) {
      const element = this.elements[index];

      if (
        !this.indexFound[index] && // skip this element if it has already been associated with a name
        name.length === element[BSONElementOffset.nameLength] && // Since we assume basic latin, check the js length against the BSON length before comparing
        StringFinder.includes(this.bson, name, element[BSONElementOffset.nameOffset]) // compare
      ) {
        this.elementOf[name] = element;
        this.indexFound[index] = true;
        this.existenceOf[name] = true;
        return this.elementOf[name];
      }
    }

    this.existenceOf[name] = false;
    return null;
  }

  private reviveValue<T extends keyof JSTypeOf>(element: BSONElement, as: T): JSTypeOf[T];
  private reviveValue(element: BSONElement, as: keyof JSTypeOf): any {
    const type = element[BSONElementOffset.type];
    const offset = element[BSONElementOffset.offset];
    const length = element[BSONElementOffset.length];

    if (as !== type) {
      // FIXME need to translate minKey to unsigned value if support is added later
      throw new BSONError(`Expected to find type ${as} at offset ${offset} but found ${type}`);
    }

    switch (as) {
      case BSONType.int:
        return getInt32LE(this.bson, offset);
      case BSONType.long:
        return getBigInt64LE(this.bson, offset);
      case BSONType.bool:
        return Boolean(this.bson[offset]);
      case BSONType.objectId:
        return new ObjectId(this.bson.subarray(offset, offset + 12));
      case BSONType.timestamp:
        return new Timestamp(getBigInt64LE(this.bson, offset));
      case BSONType.string:
        return toUTF8(this.bson, offset + 4, offset + length - 1, false);
      case BSONType.binData: {
        const totalBinarySize = getInt32LE(this.bson, offset);
        const subType = this.bson[offset + 4];

        if (subType === 2) {
          const subType2BinarySize = getInt32LE(this.bson, offset + 1 + 4);
          if (subType2BinarySize < 0)
            throw new BSONError('Negative binary type element size found for subtype 0x02');
          if (subType2BinarySize > totalBinarySize - 4)
            throw new BSONError('Binary type with subtype 0x02 contains too long binary size');
          if (subType2BinarySize < totalBinarySize - 4)
            throw new BSONError('Binary type with subtype 0x02 contains too short binary size');
          return new Binary(
            this.bson.subarray(offset + 1 + 4 + 4, offset + 1 + 4 + 4 + subType2BinarySize),
            2
          );
        }

        return new Binary(
          this.bson.subarray(offset + 1 + 4, offset + 1 + 4 + totalBinarySize),
          subType
        );
      }
      case BSONType.date:
        // Pretend this is correct.
        return new Date(Number(getBigInt64LE(this.bson, offset)));

      case BSONType.object:
        return new OnDemandDocument(this.bson, offset);
      case BSONType.array:
        return new OnDemandDocument(this.bson, offset, true);

      default:
        throw new Error(`Unsupported BSON type: ${as}`);
    }
  }

  public hasElement(name: string): boolean {
    return (this.existenceOf[name] ??= this.getElement(name) != null);
  }

  public getValue<const T extends keyof JSTypeOf, const Req extends boolean = false>(
    name: string,
    as: T,
    required?: Req
  ): Req extends true ? JSTypeOf[T] : JSTypeOf[T] | null;
  public getValue<const T extends keyof JSTypeOf>(
    name: string,
    as: T,
    required: boolean
  ): JSTypeOf[T] | null {
    const element = this.getElement(name);
    if (element == null) {
      if (required === true) {
        throw new BSONError(`BSON element "${name}" is missing`);
      } else {
        return null;
      }
    }

    if (!(name in this.valueOf)) {
      this.valueOf[name] = this.reviveValue(element, as);
    }

    return this.valueOf[name];
  }

  /**
   * Deserialize this object, will not cache result avoid multiple invocations
   * @param options - BSON deserialization options
   */
  public toObject(options?: BSONSerializeOptions): Record<string, any> {
    return BSON.deserialize(this.bson, {
      ...options,
      index: this.offset,
      allowObjectSmallerThanBufferSize: true
    });
  }

  /**
   * If this is an array with all elements being the same type
   * Skip converting the keys and start iterating the values!
   */
  public *valuesAs<const T extends keyof JSTypeOf>(as: T): Generator<JSTypeOf[T]> {
    if (!this.isArray) {
      throw new BSONError('Unexpected conversion of non-array value to array');
    }
    let counter = 0;
    for (const element of this.elements) {
      const item = this.reviveValue<T>(element, as);
      this.valueOf[counter] = item;
      yield item;
      counter += 1;
    }
  }
}
