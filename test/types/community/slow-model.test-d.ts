/*
 * The following type testing was adapted from @ermik
 * it is a reproduction of a slow down in typescript compilation
 * as well as issues with compiling recursive schemas
 * https://github.com/thinkalpha/node-mongodb-typechecking-performance
 */

import type { UUID } from 'bson';

import type { Collection, Db } from '../../mongodb';

interface MomentInputObject {
  years?: number;
  year?: number;
  y?: number;

  months?: number;
  month?: number;
  M?: number;

  days?: number;
  day?: number;
  d?: number;

  dates?: number;
  date?: number;
  D?: number;

  hours?: number;
  hour?: number;
  h?: number;

  minutes?: number;
  minute?: number;
  m?: number;

  seconds?: number;
  second?: number;
  s?: number;

  milliseconds?: number;
  millisecond?: number;
  ms?: number;
}

interface MomentSetObject extends MomentInputObject {
  weekYears?: number;
  weekYear?: number;
  gg?: number;

  isoWeekYears?: number;
  isoWeekYear?: number;
  GG?: number;

  quarters?: number;
  quarter?: number;
  Q?: number;

  weeks?: number;
  week?: number;
  w?: number;

  isoWeeks?: number;
  isoWeek?: number;
  W?: number;

  dayOfYears?: number;
  dayOfYear?: number;
  DDD?: number;

  weekdays?: number;
  weekday?: number;
  e?: number;

  isoWeekdays?: number;
  isoWeekday?: number;
  E?: number;
}

export type Model = ModelBase;

export type SpecificModel = Model;

export interface ModelBase {
  another: AnotherSpecificModel;
}

export interface AnotherSpecificModel {
  specifics: SpecificModel[];
}

export interface CircularModel {
  _id: UUID;
  data: SpecificModel;
}

export type SlowModelPatch = Partial<SlowModelBase>;

export interface SlowModelBase {
  prop1: string;
  prop2: string;
  prop3: Type1;
  prop5: AltUnit | null;
  prop6: string | null;
  prop7: string | null;
  prop8: string[];
  prop9: ExtraType2[];
  prop10: boolean;
  prop11: string | null;
  prop12: string[];
  prop15: ExtraType6 | null;
  prop16: string[];
  prop17: string | null;
  prop18: ExtraType7[];
  prop19: ExtraType8[];
  prop20: boolean;
  prop21: boolean;
  prop22: number;
}

export declare type Type1 = AltType1 | ExtraType1;

export declare type AltType1 = Type1A | Type1B | Type1C;

export declare enum Type1A {
  Key1 = 'value1',
  Key2 = 'value2',
  Key3 = 'value3',
  Key4 = 'value4',
  Key5 = 'value5',
  Key6 = 'value6',
  Key7 = 'value7',
  Key8 = 'value8',
  Key9 = 'value9',
  Key10 = 'value10',
  Key11 = 'value11',
  Key12 = 'value12',
  Key13 = 'value13',
  Key14 = 'value14'
}

export declare type Type1B =
  | {
      type: Type1A.Key1 | Type1A.Key2;
      valueKey1Key2?: boolean;
    }
  | {
      type: Type1A.Key12;
      valueKey12?: boolean;
    }
  | {
      type: Type1A.Key6;
    }
  | {
      type: Type1A.Key7;
    }
  | {
      type: Type1A.Key13;
    }
  | {
      type: Type1A.Key5;
    }
  | {
      type: Type1A.Key14;
    }
  | {
      type: Type1A.Key8;
    }
  | {
      type: Type1A.Key11;
    }
  | {
      type: Type1A.Key9;
    }
  | {
      type: Type1A.Key3;
    }
  | {
      type: Type1A.Key10;
    }
  | {
      type: Type1A.Key4;
    };

export declare type ExtraType1 = {
  index: number;
};
export declare type Type1C = {
  series: AltType1;
  default?: TimeType;
};

export declare enum PeriodType {
  second = 's',
  minute = 'm',
  hour = 'h',
  day = 'd',
  week = 'W',
  month = 'Mo',
  quarter = 'Q',
  year = 'Y'
}
export declare const PeriodNames: readonly string[];
export declare const PeriodNameMap: ReadonlyMap<PeriodType, string>;
export declare const PeriodTypes: readonly PeriodType[];
export declare type LengthType = LengthType2;
export interface LengthType2 {
  value: number;
  period: PeriodType;
}
export declare type TimeType2 = null | {
  periods: LengthType2[];
  anchor: MomentSetObject | null;
};
export declare type TimeType1 = Date;
export declare type TimeType3 = number;

export declare type TimeType = TimeType1 | TimeType2 | TimeType3;

export declare enum UnitType1 {
  unit1 = 'unit1',
  unit2 = 'unit2',
  unit3 = 'unit3',
  unit4 = 'unit4',
  unit5 = 'unit5'
}
export declare enum UnitType2 {
  unitA = 'unitA',
  unitB = 'unitB',
  unitC = 'unitC',
  unitD = 'unitD'
}
export declare type ExtraUnit = {
  index: number;
};
export declare type AltUnit = UnitType1 | UnitType2;

export interface ExtraType2 {
  prop23?: string;
  prop24?: string;
  prop25: AltType1;
  prop26?: AltUnit;
  prop27?: string;
  prop28: boolean;
  prop29?: ExtraType9;
  prop30?: ExtraType10;
  prop31?: ExtraType11;
  prop32?: ExtraType12;
  prop33: boolean;
}

export type ExtraType9 = ExtraType6;

const UnitType3 = {
  unit_: 'unit_',
  unit__: 'unit__',
  unit___: 'unit___',
  unit____: 'unit____',
  unit_____: 'unit_____'
} as const;

export type UnitType3 = (typeof UnitType3)[keyof typeof UnitType3];

export interface ExtraType10 {
  prop34?: UnitType3;
  prop35?: number;
  prop36?: number;
  prop37?: boolean;
}

export interface ExtraType11 {
  prop38?: number;
  prop39?: boolean;
  prop40?: boolean;
  prop41?: boolean;
}

export interface ExtraType12 {
  _id?: UUID;
  prop42: ExtraType13[];
}

export interface ExtraType14 {
  prop42: TimeType;
  prop43?: TimeType | null;
  prop44?: LengthType2;
}

export type ExtraType15 = string | number | boolean | ExtraType14 | TimeType | LengthType2;
export type ExtraType16 = {
  prop45: string | number;
  prop46: ExtraType15;
  prop47: ExtraType15;
  prop48: string;
};
export type ExtraType13 = ExtraType15 | ExtraType16;

export interface ExtraType6 {
  prop49: SpecialType[];
  prop50: string;
}

export interface SlowModel extends SlowModelBase {
  _id: UUID;
}

export interface SpecialType extends SlowModel {
  prop51: string;
}

export type ExtraType19 = ExtraType15[] | ExtraType20;
export interface ExtraType7<T extends ExtraType19 = ExtraType19> {
  id: UUID;
  prop66?: string;
  prop67: T;
  prop68?: ExtraType21;
  prop69?: ExtraType22;
  prop70?: string;
}

export interface ExtraType20 {
  prop71: string;
  prop72: string;
  prop73: number;
  prop74: SpecialType[];
}

export interface ExtraType22 {
  prop75: string;
}

export interface ExtraType21 {
  prop76: string;
  prop77: string;
  prop78: boolean;
  prop79: boolean;
  prop80: string | null;
}

export interface ExtraType8 {
  id: UUID;
  prop81: string;
  prop82: ExtraType15[];
  prop83: ExtraType15;
}

export class ExampleImpl {
  private circularCol: Collection<CircularModel>;
  private slowCol: Collection<SlowModel>;

  constructor(db: Db) {
    this.circularCol = db.collection('circular');
    this.slowCol = db.collection('slow');
  }

  public method = async (): Promise<void> => {
    /*
     * This call shows the base issue with recursive types
     */
    await this.circularCol.findOne({});
  };

  public update = async (patch: SlowModelPatch, prop1: string): Promise<void> => {
    /*
     * This call shows the major issue with type inference causing
     * an infinite typechecking loop / major slowdown in TypeScript
     * compilation times
     */
    await this.slowCol.updateOne({}, { $set: { ...patch, prop1 } });
  };
}
