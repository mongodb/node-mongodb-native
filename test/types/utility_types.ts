export type PropExists<Type, Key extends string> = Key extends keyof Type ? true : false;
